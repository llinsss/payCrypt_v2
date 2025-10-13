Welcome to TaggedPay Seamless Crypto Payments for Africa — Starting with Nigeria Imagine sending money to your friend in Lagos as easily as sending a WhatsApp message." Right now, if you want to send crypto to someone, you need to copy and paste a 42-character wallet address that looks like this: 0x028add5d29f4aa3e4144ba1a85d509de6719e58cabe42cc72f58f46c6a84a785. One wrong character? Your money disappears forever. TaggedPay changes everything. Instead of that nightmare, you simply send to @john or @sarah_lagos. That's it. No more copying addresses, no more fear of losing funds, no more barriers to digital payments

Here's what makes TaggedPay revolutionary for Africa: 
1. @Tag Payments - Replace 42-character addresses with simple tags like @yourname 
2. Instant NGN Conversion - Receive crypto, instantly convert to Naira via Paystack 
3. Multi-Chain Support - Works across Ethereum, Base, Starknet, and Core networks 
4. One-Click Bank Withdrawals - Move funds to your Nigerian bank account in seconds 
5. KYC Compliant - Fully regulated and secure for legal transactions The African crypto market is exploding - Nigeria alone processes over $400M in crypto monthly. But adoption is stuck because crypto is too complex for everyday people.

TaggedPay makes crypto as simple as mobile money, but with global reach and lower fees. We're not just building a payment app - we're building the financial infrastructure that will connect Africa to the global digital economy. The future of money is here. It just needed to speak our language.

 Tech Stack 
 Frontend: Next.js / React 
 Backend: Node.js / Express 
 Blockchain: Starknet,Solidity 
 Database: PostgreSQL 
 Payments: Paystack, Monnify 
 Auth: OAuth 2.0 + KYC provider

Tagged is currently deployed on testnest on the following chains. 

flow - Flow Sepolia
Deployer: 0x09c5096AD92A3eb3b83165a4d177a53D3D754197
Deployed to: 0xEc38bc9Be954b1b95501167A443b5cc81E6e3975
Transaction hash: 0x5f1eedeb5720078c0ebfd300101770eeb99ab982fa4c418b1daee6f3f5d89bf8

Base: BASE Sepolia
Deployer: 0x4246a99Db07C10fCE03ab238f68E5003AC5264a1
Deployed to: 0xD45839223f4B50a113Deba22a7e11Aab7B4C9F7d
Transaction hash: 0x520d169be28dd6b7e27da1f827a8bef49c02af1de9af7a766136c3535dc4fe9c

LISK SEPOLIA
Deployer: 0x09c5096AD92A3eb3b83165a4d177a53D3D754197
Deployed to: 0xEc38bc9Be954b1b95501167A443b5cc81E6e3975
Transaction hash: 0xbb7dad98a7ab7d3d7af0bdebe5d642e11513dc049b5ddaf71d53220784df6a9e

STARKNET: 0x028add5d29f4aa3e4144ba1a85d509de6719e58cabe42cc72f58f46c6a84a785

currently testing on these chains and will be going on mainnet soon

Demo Instructions

simply visit https://taggedpay.xyz/
sign up, do kyc (we accept dummy data for now)
then explore the product.

  
  Prerequisites

Node.js 18+ installed
MySQL database running
Git installed

Quick Setup

 1. Clone & Install
   bash
git clone https://github.com/llinsss/payCrypt_v2.git
cd payCrypt_v2
npm install
cd backend && npm install && cd 


2. Database Setup
  bash
cd backend
cp .env.example .env
 Edit .env with your MySQL credentials
npm run migrate


 3. Start Application
  bash
  Terminal 1: Backend
cd backend && npm run dev

  Terminal 2: Frontend  
npm run dev


 Demo Flow

 Access Points
- Frontend: http://localhost:5173
- Backend: http://localhost:3000

 Demo Steps

1. Register Account
   - Create account with @tag (e.g., @john_lagos)
   - Complete KYC verification

2. Explore Dashboard
   - View multi-chain balances
   - See supported tokens (STRK, LSK, BASE, FLOW)
   - Check transaction history

3. Test @Tag Payments
   - Share your @tag for receiving
   - Use QR code generation
   - Test cross-chain transfers

4. Banking Integration
   - Link Nigerian bank account
   - Test crypto-to-NGN conversion
   - Withdraw to bank account

  Key Features to Demo
- @Tag payments vs wallet addresses
- Multi-chain support (4 networks)
- Instant NGN conversion
- Mobile-responsive design
- Real-time balance updates

  Troubleshooting
- Ensure MySQL is running
- Check ports 3000 (backend) and 5173 (frontend) are free
- Run `npm install` in both root and backend directories

Demo showcases how TaggedPay makes crypto payments as simple as WhatsApp for African users.

U2U Network Integration Documentation

Overview
The U2U Network is integrated into the project through smart contracts, on-chain account creation, and token operations. The project leverages U2U’s EVM-compatible blockchain to provide decentralized, tag-based smart wallets and seamless asset transfers.

1. Deployment on U2U Mainnet
The core smart contracts, including the TagRouter and Wallet contracts, are written in Solidity and deployed directly on the U2U Mainnet. This integration enables:

Low transaction fees
Fast finality
Full EVM compatibility

2. On-Chain Smart Wallet Creation
When a user registers a unique tag (e.g., @username), a dedicated smart wallet is automatically deployed for them on the U2U network via the TagRouter. 
Each wallet:
Exists fully on-chain
Is controlled by contract logic (not private keys)
Supports account abstraction-style operations

3. Support for U2U and ERC-20 Tokens

Each smart wallet can manage multiple asset types on the U2U blockchain:
U2U native tokens
ERC-20 tokens deployed on U2U
Operations supported include:
Deposits to a tag wallet
Tag-to-tag transfers (wallet-to-wallet)
Balance checks and withdrawals

4. Router-Controlled Operations (Paymaster Model)
The TagRouter contract acts as a controller and optional paymaster, 
enabling:
Gasless or sponsored transactions
Secure withdrawals using withdrawETH and withdrawERC20
Internal swaps between U2U and ERC-20 tokens
This ensures a smooth user experience while maintaining full decentralization.

5. Decentralization and Transparency
All wallet logic, asset transfers, and swaps are executed via U2U blockchain transactions. 
There are:
No centralized servers managing funds
Complete transparency through the public ledger
Immutable transaction history for all tag operations
