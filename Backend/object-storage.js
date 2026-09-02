const {
    AbortMultipartUploadCommand,
    CompleteMultipartUploadCommand,
    CreateMultipartUploadCommand,
    DeleteObjectsCommand,
    GetObjectCommand,
    ListObjectsV2Command,
    ListPartsCommand,
    PutObjectCommand,
    S3Client,
    UploadPartCommand
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const DEFAULT_PART_SIZE = 64 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const DOWNLOAD_URL_TTL_SECONDS = 15 * 60;

function deleteObjectKeys(client, bucket, keys) {
    return Promise.all(
        Array.from({ length: Math.ceil(keys.length / 1000) }, (_, index) => {
            const batch = keys.slice(index * 1000, (index + 1) * 1000);
            if (!batch.length) return null;
            return client.send(new DeleteObjectsCommand({
                Bucket: bucket,
                Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true }
            }));
        }).filter(Boolean)
    );
}

async function checkObjectAccess(client, bucket) {
    await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));
    return true;
}

function createObjectStorage(env = process.env) {
    const provider = (env.PHOCLOUD_TRANSFER_STORAGE || "local").trim().toLowerCase();
    if (provider !== "r2") {
        return {
            enabled: false,
            provider: "local",
            partSize: DEFAULT_PART_SIZE,
            healthcheck: async () => true
        };
    }

    const accountId = env.PHOCLOUD_R2_ACCOUNT_ID?.trim();
    const accessKeyId = env.PHOCLOUD_R2_ACCESS_KEY_ID?.trim();
    const secretAccessKey = env.PHOCLOUD_R2_SECRET_ACCESS_KEY?.trim();
    const bucket = env.PHOCLOUD_R2_BUCKET?.trim();
    const missing = [
        ["PHOCLOUD_R2_ACCOUNT_ID", accountId],
        ["PHOCLOUD_R2_ACCESS_KEY_ID", accessKeyId],
        ["PHOCLOUD_R2_SECRET_ACCESS_KEY", secretAccessKey],
        ["PHOCLOUD_R2_BUCKET", bucket]
    ].filter(([, value]) => !value).map(([name]) => name);
    if (missing.length) {
        throw new Error(`Configuración R2 incompleta: ${missing.join(", ")}`);
    }

    const endpoint = env.PHOCLOUD_R2_ENDPOINT?.trim()
        || `https://${accountId}.r2.cloudflarestorage.com`;
    const client = new S3Client({
        region: "auto",
        endpoint,
        requestChecksumCalculation: "WHEN_REQUIRED",
        credentials: { accessKeyId, secretAccessKey }
    });

    function createKey(transferId, fileId) {
        return `transfers/${transferId}/${fileId}`;
    }

    async function startMultipart({ transferId, fileId, contentType, filename }) {
        const key = createKey(transferId, fileId);
        const response = await client.send(new CreateMultipartUploadCommand({
            Bucket: bucket,
            Key: key,
            ContentType: contentType || "application/octet-stream",
            ContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
        }));
        return { key, uploadId: response.UploadId };
    }

    async function signPart({ key, uploadId, partNumber }) {
        const command = new UploadPartCommand({
            Bucket: bucket,
            Key: key,
            UploadId: uploadId,
            PartNumber: partNumber
        });
        return getSignedUrl(client, command, { expiresIn: SIGNED_URL_TTL_SECONDS });
    }

    async function completeMultipart({ key, uploadId, parts }) {
        await client.send(new CompleteMultipartUploadCommand({
            Bucket: bucket,
            Key: key,
            UploadId: uploadId,
            MultipartUpload: {
                Parts: parts.map((part) => ({
                    ETag: part.etag,
                    PartNumber: part.partNumber
                }))
            }
        }));
    }

    async function abortMultipart({ key, uploadId }) {
        if (!key || !uploadId) return;
        await client.send(new AbortMultipartUploadCommand({
            Bucket: bucket,
            Key: key,
            UploadId: uploadId
        }));
    }

    async function listParts({ key, uploadId }) {
        const parts = [];
        let partNumberMarker;
        do {
            const response = await client.send(new ListPartsCommand({
                Bucket: bucket,
                Key: key,
                UploadId: uploadId,
                PartNumberMarker: partNumberMarker
            }));
            for (const part of response.Parts || []) {
                parts.push({
                    partNumber: Number(part.PartNumber),
                    etag: part.ETag,
                    size: Number(part.Size || 0)
                });
            }
            partNumberMarker = response.IsTruncated
                ? response.NextPartNumberMarker
                : undefined;
        } while (partNumberMarker);
        return parts;
    }

    async function downloadUrl(key, filename) {
        const command = new GetObjectCommand({
            Bucket: bucket,
            Key: key,
            ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
        });
        return getSignedUrl(client, command, { expiresIn: DOWNLOAD_URL_TTL_SECONDS });
    }

    async function getObjectStream(key) {
        const response = await client.send(new GetObjectCommand({
            Bucket: bucket,
            Key: key
        }));
        return response.Body;
    }

    async function deleteKeys(keys) {
        await deleteObjectKeys(client, bucket, keys);
    }

    async function healthcheck() {
        return checkObjectAccess(client, bucket);
    }

    return {
        enabled: true,
        provider: "r2",
        bucket,
        endpointOrigin: new URL(endpoint).origin,
        partSize: DEFAULT_PART_SIZE,
        startMultipart,
        signPart,
        completeMultipart,
        abortMultipart,
        listParts,
        downloadUrl,
        getObjectStream,
        deleteKeys,
        healthcheck
    };
}

function createGalleryStorage(env = process.env) {
    const provider = (env.PHOCLOUD_GALLERY_STORAGE || "local").trim().toLowerCase();
    if (provider !== "r2") {
        return {
            enabled: false,
            provider: "local",
            healthcheck: async () => true
        };
    }

    const accountId = env.PHOCLOUD_R2_ACCOUNT_ID?.trim();
    const accessKeyId = env.PHOCLOUD_GALLERY_R2_ACCESS_KEY_ID?.trim();
    const secretAccessKey = env.PHOCLOUD_GALLERY_R2_SECRET_ACCESS_KEY?.trim();
    const bucket = env.PHOCLOUD_GALLERY_R2_BUCKET?.trim();
    const missing = [
        ["PHOCLOUD_R2_ACCOUNT_ID", accountId],
        ["PHOCLOUD_GALLERY_R2_ACCESS_KEY_ID", accessKeyId],
        ["PHOCLOUD_GALLERY_R2_SECRET_ACCESS_KEY", secretAccessKey],
        ["PHOCLOUD_GALLERY_R2_BUCKET", bucket]
    ].filter(([, value]) => !value).map(([name]) => name);
    if (missing.length) {
        throw new Error(`Configuración R2 de galerías incompleta: ${missing.join(", ")}`);
    }

    const endpoint = env.PHOCLOUD_R2_ENDPOINT?.trim()
        || `https://${accountId}.r2.cloudflarestorage.com`;
    const client = new S3Client({
        region: "auto",
        endpoint,
        requestChecksumCalculation: "WHEN_REQUIRED",
        credentials: { accessKeyId, secretAccessKey }
    });

    function objectKey(deliveryId, filename) {
        return `galleries/${deliveryId}/originals/${filename}`;
    }

    async function uploadFile({
        deliveryId, filename, filePath, contentType, size
    }) {
        const key = objectKey(deliveryId, filename);
        await client.send(new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: require("fs").createReadStream(filePath),
            ContentLength: size,
            ContentType: contentType || "application/octet-stream",
            ContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(filename)}`
        }));
        return key;
    }

    async function signedUrl(key, filename, download = false) {
        return getSignedUrl(client, new GetObjectCommand({
            Bucket: bucket,
            Key: key,
            ResponseContentDisposition: `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(filename)}`
        }), { expiresIn: DOWNLOAD_URL_TTL_SECONDS });
    }

    async function getObjectStream(key) {
        const response = await client.send(new GetObjectCommand({
            Bucket: bucket,
            Key: key
        }));
        return response.Body;
    }

    return {
        enabled: true,
        provider: "r2",
        bucket,
        endpointOrigin: new URL(endpoint).origin,
        objectKey,
        uploadFile,
        inlineUrl: (key, filename) => signedUrl(key, filename, false),
        downloadUrl: (key, filename) => signedUrl(key, filename, true),
        getObjectStream,
        deleteKeys: (keys) => deleteObjectKeys(client, bucket, keys),
        healthcheck: () => checkObjectAccess(client, bucket)
    };
}

module.exports = {
    createObjectStorage,
    createGalleryStorage,
    DEFAULT_PART_SIZE
};
