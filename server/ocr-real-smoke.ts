process.env.KNOWLEDGE_FORGE_RUN_OCR_SMOKE = "1";
process.env.KNOWLEDGE_FORGE_REQUIRE_OCR_SMOKE = "1";

await import("./ocr-smoke.js");
