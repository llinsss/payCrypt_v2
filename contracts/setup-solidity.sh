#!/bin/bash
set -e

echo "🔧 Setting up Solidity contracts..."

# Check if Foundry is installed
if ! command -v forge &> /dev/null; then
    echo "📦 Installing Foundry..."
    curl -L https://foundry.paradigm.xyz | bash
    source ~/.zshenv || source ~/.bashrc
    foundryup
else
    echo "✅ Foundry already installed"
fi

# Check if libusb is installed (macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    if ! brew list libusb &> /dev/null; then
        echo "📦 Installing libusb..."
        brew install libusb
    else
        echo "✅ libusb already installed"
    fi
fi

# Navigate to solidity contracts directory
cd "$(dirname "$0")/solidity_contract"

# Install dependencies
echo "📦 Installing contract dependencies..."
forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts

# Build contracts
echo "🔨 Building contracts..."
forge build

echo "✅ Solidity contracts setup complete!"
echo "📁 Compiled artifacts: $(pwd)/out"
