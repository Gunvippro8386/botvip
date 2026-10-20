# Tu Tiên Online

Game MMORPG tu tiên 2D chạy trên trình duyệt (điện thoại, iPad, máy tính). Nhiều người chơi cùng một thế giới.

## Tính năng bản 0.1
- Đăng nhập bằng đạo hiệu và mật khẩu, tên mới tự tạo nhân vật
- Bản đồ 72×56 ô: thành trấn, linh tuyền, rừng, hồ, đường đá
- Thấy người chơi khác đi lại theo thời gian thực, chat thế giới
- Tọa thiền hút linh khí (ngồi ở linh tuyền được ×3)
- 9 cảnh giới × 4 kỳ, đột phá có tỉ lệ thất bại
- Yêu thú mạnh dần khi đi xa thành trấn, đánh rơi linh thạch và linh khí
- Bảng xếp hạng, tự lưu dữ liệu vào `data/players.json`

Điều khiển: chạm vào bản đồ để đi, chạm vào yêu thú để tự đánh. Trên máy tính dùng WASD hoặc mũi tên, F để tấn công, M để tọa thiền, Enter để chat.

## Cài lên VPS Ubuntu

```bash
# 1. Cài Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git

# 2. Lấy code
git clone -b claude/tutien-online https://github.com/Gunvippro8386/botvip.git
cd botvip/tutien-online
npm install

# 3. Mở cổng 3000
sudo ufw allow 3000

# 4. Chạy thường trực bằng pm2 (tự bật lại khi VPS khởi động lại)
sudo npm install -g pm2
pm2 start server.js --name tutien
pm2 save
pm2 startup
```

Mở trình duyệt vào `http://IP_VPS:3000` để chơi.

Lệnh hay dùng:
- `pm2 logs tutien`: xem log
- `pm2 restart tutien`: khởi động lại sau khi cập nhật code (`git pull` trước)
- Đổi cổng: `PORT=8080 pm2 start server.js --name tutien`
