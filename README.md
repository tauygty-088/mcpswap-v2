# MCPSwap v2 (test build, separate from mcpswap.xyz)

Bản test riêng biệt, dùng React + Next.js + OnchainKit theo chuẩn Base docs,
để có modal Connect Wallet chuẩn (Sign in with Base, Coinbase Wallet, MetaMask,
WalletConnect). **mcpswap.xyz hiện tại không bị đụng vào.**

## Trước khi chạy, cần 2 API key (miễn phí)

1. **OnchainKit API key**: https://portal.cdp.coinbase.com/products/onchainkit
   → tạo project → copy key
2. **WalletConnect Project ID** (để hỗ trợ thêm ví như Phantom qua QR/mobile):
   https://cloud.reown.com → tạo project → copy Project ID

Tạo file `.env.local` ở gốc project:
```
NEXT_PUBLIC_ONCHAINKIT_API_KEY=your_key_here
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id_here
```

## Chạy thử local

```bash
cd mcpswap-v2
npm install
npm run dev
```
Mở http://localhost:3000

## Deploy lên Vercel để test (không đụng domain mcpswap.xyz)

```bash
npm install -g vercel
vercel
```
Làm theo hướng dẫn trên terminal (đăng nhập, chọn tên project, ví dụ
`mcpswap-v2`). Vercel sẽ cho 1 link dạng `mcpswap-v2.vercel.app` để test.

Nhớ thêm 2 biến môi trường ở trên vào Vercel dashboard (Settings →
Environment Variables) trước khi deploy production.

## Những gì đã làm trong bản này

- Next.js App Router + TypeScript + Tailwind
- wagmi + viem, cấu hình sẵn Base mainnet (chain 8453)
- 3 connector: Base Account (Sign in with Base), injected (MetaMask/browser
  wallet), WalletConnect (Phantom, mobile wallets qua QR)
- @coinbase/onchainkit: ConnectWallet, Wallet, WalletDropdown cho đúng modal
  chuẩn Base docs
- Token màu/nav/layout theo đúng bảng đã thống nhất: nền #0A0B0D, accent
  Base Blue #0052FF, border #1E2128
- Tab Swap dùng component Swap có sẵn của OnchainKit (ETH - USDC mẫu, tự
  thêm token khác vào app/page.tsx)
- 3 tab Mint NFT / Deploy Contract / Breed NFT: đang là placeholder, chưa
  port logic từ bản HTML cũ sang, cần làm tiếp sau khi chốt được phần
  Connect Wallet + Swap

## Lưu ý kỹ thuật (nếu build lỗi)

next.config.ts có vài dòng alias module thừa (@x402/*, @coinbase/cdp-sdk).
Đây không phải bug, là cách chặn 1 nhánh code không dùng tới (Base
subscription payments) đang kéo theo các package Solana không cần thiết,
gây lỗi build. Đừng xóa các dòng alias này.

## Việc cần làm tiếp

1. Đại ca lấy 2 API key ở trên, test thử trên Vercel
2. Xác nhận modal Connect Wallet đúng ý (Sign in with Base, MetaMask,
   Coinbase Wallet, WalletConnect)
3. Nếu ổn, em port tiếp phần Mint NFT / Deploy Contract / Breed NFT từ
   index.html cũ sang React
4. Khi toàn bộ đã test xong, mới tính chuyện thay thế mcpswap.xyz thật
