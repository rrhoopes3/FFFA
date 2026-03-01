#!/bin/bash
# setup-ollama.sh — Set up Ollama + recommended models for OmnibusAI
#
# Run on your RTX 3090 machine:
#   chmod +x scripts/setup-ollama.sh
#   ./scripts/setup-ollama.sh

set -e

echo "=== OmnibusAI: Ollama Setup ==="
echo ""

# Check if Ollama is installed
if ! command -v ollama &> /dev/null; then
  echo "Ollama not found. Installing..."
  curl -fsSL https://ollama.com/install.sh | sh
  echo ""
fi

echo "Ollama version: $(ollama --version 2>/dev/null || echo 'unknown')"
echo ""

# Start Ollama if not running
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
  echo "Starting Ollama server..."
  ollama serve &
  sleep 3
fi

echo "Pulling recommended models for RTX 3090 (24GB VRAM)..."
echo ""

# Quality model for division overviews (~20GB VRAM)
echo "1/3: qwen2.5:32b-instruct-q4_K_M (quality model, ~20GB)"
echo "     Best for: division-level overviews"
ollama pull qwen2.5:32b-instruct-q4_K_M

echo ""

# Fast model for title/section summaries (~12GB VRAM)
echo "2/3: qwen2.5:14b-instruct-q5_K_M (fast model, ~12GB)"
echo "     Best for: title and section summaries"
ollama pull qwen2.5:14b-instruct-q5_K_M

echo ""

# Fastest model for individual sections (~5GB VRAM)
echo "3/3: llama3.1:8b-instruct (fastest model, ~5GB)"
echo "     Best for: quick section-level summaries"
ollama pull llama3.1:8b-instruct

echo ""
echo "=== Models installed ==="
ollama list
echo ""

# Quick test
echo "Running quick test..."
RESPONSE=$(curl -s http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen2.5:14b-instruct-q5_K_M",
    "messages": [{"role": "user", "content": "Summarize in one sentence: The Department of Defense is allocated $886 billion."}],
    "max_tokens": 100,
    "stream": false
  }')

if echo "$RESPONSE" | grep -q "choices"; then
  echo "Test passed! Ollama is working."
  echo "Response: $(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['choices'][0]['message']['content'])" 2>/dev/null || echo "$RESPONSE")"
else
  echo "Test failed. Response: $RESPONSE"
fi

echo ""
echo "=== Next steps ==="
echo ""
echo "1. Local use:"
echo "   cp .env.example .env"
echo "   # Edit .env: AI_PROVIDER=ollama, OLLAMA_BASE_URL=http://localhost:11434"
echo "   npm run pipeline -- 118-hr-4366"
echo ""
echo "2. Remote access via Cloudflare Tunnel:"
echo "   ./scripts/setup-tunnel.sh"
echo ""
