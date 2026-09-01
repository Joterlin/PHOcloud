const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Jimp } = require("jimp");

const PREVIEW_FOLDER = ".previews";
const BRAND_FOLDER = ".brand";

function previewFilename(filename) {
    return `${crypto.createHash("sha256")
        .update(filename)
        .digest("hex")
        .slice(0, 32)}.jpg`;
}

function previewPath(folderPath, filename) {
    return path.join(folderPath, PREVIEW_FOLDER, previewFilename(filename));
}

function galleryLogoPath(folderPath) {
    return path.join(folderPath, BRAND_FOLDER, "logo.png");
}

async function createPreview(folderPath, filename) {
    const sourcePath = path.join(folderPath, filename);
    const targetPath = previewPath(folderPath, filename);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });

    if (fs.existsSync(targetPath)
        && fs.statSync(targetPath).mtimeMs >= fs.statSync(sourcePath).mtimeMs) {
        return targetPath;
    }

    const image = await Jimp.read(sourcePath);
    if (image.width > 1600 || image.height > 1600) {
        image.scaleToFit({ w: 1600, h: 1600 });
    }
    await image.write(targetPath, { quality: 82 });
    return targetPath;
}

async function createPreviews(folderPath, filenames, concurrency = 4) {
    const queue = [...filenames];
    const failures = [];
    const workers = Array.from(
        { length: Math.min(concurrency, queue.length) },
        async () => {
            while (queue.length > 0) {
                const filename = queue.shift();
                try {
                    await createPreview(folderPath, filename);
                } catch (error) {
                    failures.push({ filename, error });
                }
            }
        }
    );
    await Promise.all(workers);
    return failures;
}

async function createLogo(source, targetPath) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const image = await Jimp.read(source);
    if (image.width > 720 || image.height > 360) {
        image.scaleToFit({ w: 720, h: 360 });
    }
    await image.write(targetPath);
    return targetPath;
}

function removePreview(folderPath, filename) {
    fs.rmSync(previewPath(folderPath, filename), { force: true });
}

module.exports = {
    BRAND_FOLDER,
    PREVIEW_FOLDER,
    createLogo,
    createPreview,
    createPreviews,
    galleryLogoPath,
    previewPath,
    removePreview
};
