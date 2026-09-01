const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const { createObjectStorage } = require("./object-storage");

async function requestBody(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    return Buffer.concat(chunks);
}

function xml(res, status, body) {
    res.writeHead(status, { "Content-Type": "application/xml" });
    res.end(body);
}

test("crea, completa, descarga y elimina una subida multipart compatible con R2", async () => {
    const parts = new Map();
    let completedObject = null;
    let deleted = false;
    let corsConfiguration = "";
    let lifecycleConfiguration = "";
    const uploadId = "upload-de-prueba";
    const etag = "\"etag-parte-1\"";

    const mock = http.createServer(async (req, res) => {
        const url = new URL(req.url, "http://127.0.0.1");
        const key = decodeURIComponent(url.pathname)
            .replace(/^\/phocloud-transfers\//, "");

        if (req.method === "HEAD" && url.pathname === "/phocloud-transfers/") {
            res.writeHead(200);
            return res.end();
        }
        if (req.method === "PUT" && url.searchParams.has("cors")) {
            corsConfiguration = (await requestBody(req)).toString("utf8");
            res.writeHead(200);
            return res.end();
        }
        if (req.method === "PUT" && url.searchParams.has("lifecycle")) {
            lifecycleConfiguration = (await requestBody(req)).toString("utf8");
            res.writeHead(200);
            return res.end();
        }
        if (req.method === "POST" && url.searchParams.has("uploads")) {
            return xml(res, 200, [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<InitiateMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">',
                '<Bucket>phocloud-transfers</Bucket>',
                `<Key>${key}</Key><UploadId>${uploadId}</UploadId>`,
                '</InitiateMultipartUploadResult>'
            ].join(""));
        }
        if (req.method === "PUT" && url.searchParams.has("partNumber")) {
            const partNumber = Number(url.searchParams.get("partNumber"));
            parts.set(partNumber, await requestBody(req));
            res.writeHead(200, {
                ETag: etag,
                "Access-Control-Expose-Headers": "ETag"
            });
            return res.end();
        }
        if (req.method === "GET" && url.searchParams.has("uploadId")) {
            const partXml = [...parts.entries()].sort(([a], [b]) => a - b)
                .map(([partNumber, body]) => [
                    "<Part>",
                    `<PartNumber>${partNumber}</PartNumber>`,
                    `<ETag>${etag.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}</ETag>`,
                    `<Size>${body.length}</Size>`,
                    "</Part>"
                ].join("")).join("");
            return xml(res, 200, [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<ListPartsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">',
                '<Bucket>phocloud-transfers</Bucket>',
                `<Key>${key}</Key><UploadId>${uploadId}</UploadId>`,
                `<IsTruncated>false</IsTruncated>${partXml}`,
                '</ListPartsResult>'
            ].join(""));
        }
        if (req.method === "POST" && url.searchParams.has("uploadId")) {
            await requestBody(req);
            completedObject = Buffer.concat(
                [...parts.entries()].sort(([a], [b]) => a - b).map(([, body]) => body)
            );
            return xml(res, 200, [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<CompleteMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">',
                '<Location>http://127.0.0.1/object</Location>',
                '<Bucket>phocloud-transfers</Bucket>',
                `<Key>${key}</Key><ETag>${etag}</ETag>`,
                '</CompleteMultipartUploadResult>'
            ].join(""));
        }
        if (req.method === "GET" && !url.searchParams.has("uploadId")) {
            if (!completedObject || deleted) {
                return xml(res, 404, '<Error><Code>NoSuchKey</Code></Error>');
            }
            res.writeHead(200, {
                "Content-Type": "application/octet-stream",
                "Content-Length": completedObject.length,
                ETag: etag
            });
            return res.end(completedObject);
        }
        if (req.method === "POST" && url.searchParams.has("delete")) {
            await requestBody(req);
            deleted = true;
            return xml(res, 200, [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">',
                `<Deleted><Key>${key}</Key></Deleted>`,
                '</DeleteResult>'
            ].join(""));
        }
        if (req.method === "DELETE" && url.searchParams.has("uploadId")) {
            res.writeHead(204);
            return res.end();
        }
        res.writeHead(500);
        res.end(`Ruta S3 simulada no implementada: ${req.method} ${req.url}`);
    });
    mock.listen(0, "127.0.0.1");
    await once(mock, "listening");
    const address = mock.address();
    const endpoint = `http://127.0.0.1:${address.port}`;
    const storage = createObjectStorage({
        PHOCLOUD_TRANSFER_STORAGE: "r2",
        PHOCLOUD_R2_ACCOUNT_ID: "cuenta",
        PHOCLOUD_R2_ACCESS_KEY_ID: "access",
        PHOCLOUD_R2_SECRET_ACCESS_KEY: "secret",
        PHOCLOUD_R2_BUCKET: "phocloud-transfers",
        PHOCLOUD_R2_ENDPOINT: endpoint
    });

    try {
        assert.equal(await storage.healthcheck(), true);
        const bucketConfiguration = await storage.configureBucket(
            "https://app.photarea.studio/ruta-ignorada"
        );
        assert.equal(bucketConfiguration.origin, "https://app.photarea.studio");
        assert.match(corsConfiguration, /https:\/\/app\.photarea\.studio/);
        assert.match(corsConfiguration, /<AllowedMethod>PUT<\/AllowedMethod>/);
        assert.match(lifecycleConfiguration, /<Expiration><Days>1<\/Days><\/Expiration>/);
        assert.match(lifecycleConfiguration, /<DaysAfterInitiation>1<\/DaysAfterInitiation>/);

        const started = await storage.startMultipart({
            transferId: "00000000-0000-4000-8000-000000000020",
            fileId: "00000000-0000-4000-8000-000000000021",
            contentType: "text/plain",
            filename: "material.txt"
        });
        assert.equal(started.uploadId, uploadId);
        const signedUrl = await storage.signPart({
            key: started.key,
            uploadId: started.uploadId,
            partNumber: 1
        });
        const uploaded = await fetch(signedUrl, {
            method: "PUT",
            body: Buffer.from("material de prueba")
        });
        assert.equal(uploaded.status, 200);

        const listedParts = await storage.listParts(started);
        assert.deepEqual(listedParts, [{
            partNumber: 1,
            etag,
            size: Buffer.byteLength("material de prueba")
        }]);
        await storage.completeMultipart({ ...started, parts: listedParts });

        const downloadUrl = await storage.downloadUrl(started.key, "material.txt");
        const downloaded = await fetch(downloadUrl);
        assert.equal(await downloaded.text(), "material de prueba");
        const stream = await storage.getObjectStream(started.key);
        assert.equal(await stream.transformToString(), "material de prueba");

        await storage.deleteKeys([started.key]);
        assert.equal(deleted, true);
        assert.equal((await fetch(downloadUrl)).status, 404);
    } finally {
        mock.close();
        await once(mock, "close");
    }
});
