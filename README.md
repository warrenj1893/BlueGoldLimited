# BlueGold Wallet 

A modern, mobile-first Web3 dashboard for securely monitoring, sending, receiving, and buying **SGC (Standard Gold Coin)**—a fully allocated token pegged to the live price of gold.

## Features fully functional in this build:
* **Live On-Chain Oracles**: The dashboard pulls the genuine, live spot price of XAU (Gold) directly from the Ethereum Mainnet using a **Chainlink Oracle Proxy** every 15 seconds. If the oracle goes offline, the UI gracefully warns you without disrupting UX.
* **Dynamic Portfolio Graph**: An interactive, touch-drag compatible sparkline showing historical mock price data mapped against the current live Chainlink spot price. 
* **Native Wallet Purchasing Flow**: Tapping the **Buy** modal calculate dynamic SGC/USD fiat conversion rates based on the live oracle price. Clicking **Change** attempts to invoke your operating system's native checkout wallet (like **Apple Pay** or **Google Pay**) directly inside the browser using the Web Payment Request API.
* **Vault Interoperability**: Detailed mock allocations outlining your ownership fraction of physical LBMA 999.9 Good Delivery bars stored in the Brinks Dubai vault. 
* **Receive & QR Code Generator**: Instantly generate live, scannable QR codes representing your Base network receive address.

## How to Test the Project Locally
If you are running the project directly from GitHub for testing, you will need [Node.js](https://nodejs.org/) installed on your machine.

1. Install module dependencies
```bash
npm install
```

2. Start the hot-reloading development server
```bash
npm start
```

The application is heavily optimized for mobile devices but works perfectly across all form factors. 

**Note on Native Wallets (Apple/Google Pay):** The native `PaymentRequest` API for checking out using digital wallets is restricted by modern browsers to only trigger on **secure origins (HTTPS)** or exactly `localhost`. Safari on iOS/Mac will attempt to prompt Apple Pay (if configured), and Android/Chrome will trigger Google Pay or saved Basic Cards.
