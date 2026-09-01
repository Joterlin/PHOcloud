const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Jimp } = require("jimp");
const {
    createLogo,
    createPreview,
    galleryLogoPath,
    previewPath,
    removePreview
} = require("./media");

test("genera miniaturas y logotipos sin modificar el original", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "phocloud-media-"));
    const filename = "original.png";
    const sourcePath = path.join(root, filename);
    const image = new Jimp({
        width: 2200,
        height: 1200,
        color: 0xc9aa70ff
    });
    await image.write(sourcePath);
    const original = fs.readFileSync(sourcePath);

    try {
        const generatedPreview = await createPreview(root, filename);
        const preview = await Jimp.read(generatedPreview);
        assert.equal(generatedPreview, previewPath(root, filename));
        assert.equal(preview.width, 1600);
        assert.equal(fs.readFileSync(sourcePath).equals(original), true);

        const logoPath = galleryLogoPath(root);
        await createLogo(original, logoPath);
        const logo = await Jimp.read(logoPath);
        assert.equal(logo.width <= 720, true);
        assert.equal(logo.height <= 360, true);

        removePreview(root, filename);
        assert.equal(fs.existsSync(generatedPreview), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
