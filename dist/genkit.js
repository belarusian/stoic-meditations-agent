import { openAICompatible, compatOaiModelRef, } from "@genkit-ai/compat-oai";
import { genkit } from "genkit";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
// Get the directory of the current file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Read meditations text (relative to project root)
const meditationsPath = join(__dirname, "../../Sasha-Malahov/meditations.mb.txt");
const meditationsText = readFileSync(meditationsPath, "utf-8");
// Define a reference to the local model
// The model name in the modelRef should be prefixed with the plugin name, followed by a / and the model ID
const llamaCppModel = compatOaiModelRef({
    name: "llama-cpp/qwen3-coder-next-q8",
});
// Create Genkit instance with Meditations as context
// Uses OpenAI-compatible API (llama.cpp at http://10.106.1.89:8080/v1)
export const ai = genkit({
    plugins: [
        openAICompatible({
            name: "llama-cpp",
            apiKey: "dummy", // Required, but can be a placeholder for local servers
            baseURL: "http://10.106.1.89:8080/v1",
        }),
    ],
    model: llamaCppModel,
    promptDir: "./src",
});
// Pre-load the model by calling a simple prompt on startup
// This ensures the LLM is ready before the user first interacts
export async function prewarmModel() {
    try {
        console.log("[Genkit] Pre-warming the model...");
        // Call a simple prompt to initialize the model
        const result = await ai.generate({
            prompt: "Hello",
            config: {
                maxOutputTokens: 10,
            },
        });
        console.log("[Genkit] Model pre-warmed successfully");
        return result;
    }
    catch (error) {
        console.warn("[Genkit] Model pre-warm failed:", error);
        // Don't fail the startup if pre-warm fails
    }
    return undefined;
}
// Export the Meditations text for use in prompts
export { meditationsText };
export { z } from "genkit";
//# sourceMappingURL=genkit.js.map