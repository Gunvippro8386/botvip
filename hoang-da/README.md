# Hoang Dã

Game sinh tồn thế giới mở 2D, nhìn từ trên xuống, chạy trên trình duyệt (điện thoại, iPad, máy tính). Một người chơi, dữ liệu tự lưu trong trình duyệt của người chơi.

## Tính năng bản 0.1
- Thế giới tự sinh vô tận theo mã thế giới: biển, bãi cát, đồng cỏ, rừng rậm, sa mạc, đồng tuyết, núi đá
- Ba chỉ số sinh tồn: máu, đói, khát. Uống nước ở hồ, hái quả mọng, săn thú, nướng thịt
- Chặt cây, đập đá, đào mỏ sắt, nhổ cỏ lấy sợi. Bụi quả mọng tự mọc lại
- 16 công thức chế tạo: rìu, cuốc, giáo, kiếm sắt, đuốc, áo da, băng gạc, lửa trại, bàn chế tạo, tường gỗ, tường đá, giường...
- Ngày đêm (6 phút một ngày). Ban đêm tối thật, cần đuốc hoặc lửa trại để nhìn
- Thú: thỏ, hươu (chạy trốn), sói, bọ cạp (tấn công), gấu (chỉ đánh khi lại gần). Ban đêm có quỷ đêm, sợ lửa, không đi xuyên tường, tan biến khi trời sáng
- Đặt giường để hồi sinh tại chỗ. Gục ngã mất một nửa nguyên liệu, giữ công cụ
- Bản đồ nhỏ, tự lưu mỗi 15 giây

Điều khiển:
- Máy tính: WASD hoặc mũi tên để đi, chuột trái để chặt hoặc đánh, Space làm việc với thứ gần nhất, E mở túi và chế tạo, phím số chọn đồ trên thanh nhanh
- Điện thoại: kéo nửa trái màn hình để đi, nút tròn bên phải để làm việc, hoặc chạm thẳng vào thứ muốn đánh

## Chạy

Không cần cài thư viện nào, chỉ cần Node.js:

```bash
cd hoang-da
node server.js          # mở http://localhost:3001
```

Trên VPS chạy thường trực bằng pm2 (cùng máy với Tu Tiên Online cũng được vì khác cổng):

```bash
pm2 start server.js --name hoangda
pm2 save
sudo ufw allow 3001
```

Đổi cổng: `PORT=8080 pm2 start server.js --name hoangda`.

Thư mục `public/` cũng có thể đưa thẳng lên host tĩnh bất kỳ (GitHub Pages, Netlify...) vì game không cần máy chủ.

## Cấu trúc
- `public/game.js`: toàn bộ game (sinh địa hình, vật thể, sinh vật, chế tạo, vẽ, điều khiển, lưu)
- `public/index.html`, `public/style.css`: giao diện
- `server.js`: máy chủ tĩnh nhỏ
