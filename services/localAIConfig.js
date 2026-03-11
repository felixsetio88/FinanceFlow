// Configuration for supported local AI models (llama.rn / GGUF)

export const LOCAL_MODELS = [
    {
        id: 'qwen2.5-0.5b',
        name: 'Qwen 2.5 0.5B Instruct',
        description: 'Fastest, great for simple tasks and extraction.',
        fileName: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
        downloadUrl: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
        sizeBytes: 398 * 1024 * 1024,
        sizeLabel: '~398 MB',
        contextLength: 2048,
        gpuLayers: 99,
    },
    {
        id: 'llama3.2-1b',
        name: 'Llama 3.2 1B Instruct',
        description: 'Excellent reasoning and chat capabilities.',
        fileName: 'llama-3.2-1b-instruct-q4_k_m.gguf',
        downloadUrl: 'https://huggingface.co/hugging-quants/Llama-3.2-1B-Instruct-Q4_K_M-GGUF/resolve/main/llama-3.2-1b-instruct-q4_k_m.gguf',
        sizeBytes: 795 * 1024 * 1024,
        sizeLabel: '~795 MB',
        contextLength: 2048,
        gpuLayers: 99,
    },
    {
        id: 'phi3-mini-4k',
        name: 'Phi-3 Mini 4K',
        description: 'Highest quality logic and document extraction.',
        fileName: 'phi-3-mini-4k-instruct-q4.gguf',
        downloadUrl: 'https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf',
        sizeBytes: 2300 * 1024 * 1024,
        sizeLabel: '~2.3 GB',
        contextLength: 4096,
        gpuLayers: 99,
    }
];

export function getModelConfig(id) {
    return LOCAL_MODELS.find(m => m.id === id) || LOCAL_MODELS[0];
}
