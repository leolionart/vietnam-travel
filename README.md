# 🇻🇳 Vietnam Journey Planner

Ứng dụng lập kế hoạch và chia sẻ hành trình du lịch Việt Nam chuyên nghiệp, trực quan và hiện đại.

## 🌟 Tính năng nổi bật

- **Quản lý nhiều kế hoạch (Multi-plan)**: Hỗ trợ lưu trữ và chuyển đổi linh hoạt giữa nhiều hành trình khác nhau (ví dụ: Tour Miền Bắc, Xuyên Việt 2025).
- **Bản đồ tương tác (Interactive Map)**: Sử dụng Leaflet.js kết hợp với OSRM API để vẽ lộ trình thực tế trên đường bộ, không chỉ là đường chim bay.
- **Chi tiết hành trình**: Cung cấp thông tin đầy đủ về nơi lưu trú, phương tiện di chuyển, hoạt động nổi bật và ẩm thực địa phương cho từng điểm đến.
- **Chia sẻ dễ dàng**: Mỗi kế hoạch có một URL riêng biệt, giúp bạn dễ dàng gửi lộ trình cụ thể cho bạn bè hoặc người thân.
- **Giao diện hiện đại**: Thiết kế tối giản, sang trọng với Tailwind CSS, tối ưu hóa cho cả thiết bị di động và máy tính.
- **Tự động hóa CI/CD**: Tích hợp GitHub Actions để tự động build và push Docker image lên GitHub Container Registry (GHCR).

## 🛠 Công nghệ sử dụng

- **Frontend**: [Alpine.js](https://alpinejs.dev/) (Logic), [Tailwind CSS](https://tailwindcss.com/) (Styling), [Lucide](https://lucide.dev/) (Icons).
- **Bản đồ**: [Leaflet.js](https://leafletjs.com/), [OSRM](http://project-osrm.org/) (Routing service).
- **Công cụ build**: [Vite](https://vitejs.dev/).
- **Triển khai**: [Docker](https://www.docker.com/), [GitHub Actions](https://github.com/features/actions).

## 🚀 Hướng dẫn cài đặt

### Chạy cục bộ (Development)

1. Cài đặt dependencies:
   ```bash
   npm install
   ```
2. Chạy server phát triển:
   ```bash
   npm run dev
   ```

### Chạy với Docker

Ứng dụng đã được đóng gói sẵn. Bạn có thể chạy nhanh bằng Docker Compose:

```bash
docker-compose up -d
```

Ứng dụng sẽ khả dụng tại địa chỉ `http://localhost:3000`.

## 📦 Cấu trúc dự án

- `index.html`: File giao diện chính tích hợp logic Alpine.js.
- `Dockerfile` & `docker-compose.yml`: Cấu hình đóng gói và triển khai.
- `.github/workflows/`: Quy trình tự động hóa build & publish image.

## 📝 Ghi chú hành trình

Hệ thống hiện tại hỗ trợ các lộ trình:
1. **Miền Bắc**: Hà Nội - Nghệ An - Ninh Bình - Hạ Long.
2. **Xuyên Việt 2025**: TP.HCM - Đà Nẵng - Bà Nà Hill - Hội An - Nghệ An - Ninh Bình - Hà Nội.

---
*Phát triển bởi [leolionart](https://github.com/leolionart)*
