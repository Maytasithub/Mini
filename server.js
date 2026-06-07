const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'system')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'system', 'index.html'));
});

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'dear',
    database: 'van_booking_db'
});

db.connect((err) => {
    if (err) {
        console.error('MySQL connection failed:', err);
        return;
    }
    console.log('MySQL connected');
});

function normalizeTime(time) {
    if (!time) return '08:00:00';
    return time.length === 5 ? `${time}:00` : time;
}

function routeNameForDriver(driverId) {
    const names = {
        1: 'คุณโจ้ รถตู้ (รอบสายใต้)',
        2: 'คุณเอ็ม รถตู้ (รอบหมอชิต)',
        3: 'คุณบอย รถตู้ (รอบเอกมัย)'
    };
    return names[Number(driverId)] || 'รอบรถตู้ประจำทาง';
}

app.post('/api/register', (req, res) => {
    const { username, password, full_name, phone, role = 'passenger' } = req.body;

    if (!username || !password || !full_name) {
        return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
    }

    const sql = 'INSERT INTO users (username, password, full_name, phone, role) VALUES (?, ?, ?, ?, ?)';
    db.query(sql, [username, password, full_name, phone, role], (err) => {
        if (err) {
            console.error('Register error:', err);
            return res.status(500).json({ success: false, message: 'สมัครสมาชิกไม่สำเร็จ ชื่อผู้ใช้อาจซ้ำหรือข้อมูลไม่ครบ' });
        }
        res.json({ success: true, message: 'สมัครสมาชิกสำเร็จ' });
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const sql = 'SELECT user_id, username, full_name, role FROM users WHERE username = ? AND password = ?';

    db.query(sql, [username, password], (err, results) => {
        if (err) {
            console.error('Login error:', err);
            return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' });
        }

        if (results.length === 0) {
            return res.json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
        }

        res.json({ success: true, message: 'เข้าสู่ระบบสำเร็จ', user: results[0] });
    });
});

app.get('/api/users', (req, res) => {
    const sql = "SELECT user_id, username, full_name, phone, role, created_at FROM users WHERE role = 'passenger' ORDER BY user_id DESC";
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Load users error:', err);
            return res.status(500).json({ success: false, message: err.message });
        }
        res.json({ success: true, data: results });
    });
});

app.put('/api/users/:id', (req, res) => {
    const { full_name, phone } = req.body;
    const sql = 'UPDATE users SET full_name = ?, phone = ? WHERE user_id = ?';

    db.query(sql, [full_name, phone, req.params.id], (err) => {
        if (err) {
            console.error('Update user error:', err);
            return res.status(500).json({ success: false, message: 'แก้ไขข้อมูลสมาชิกไม่สำเร็จ' });
        }
        res.json({ success: true, message: 'แก้ไขข้อมูลสมาชิกสำเร็จ' });
    });
});

app.delete('/api/users/:id', (req, res) => {
    const sql = 'DELETE FROM users WHERE user_id = ?';

    db.query(sql, [req.params.id], (err) => {
        if (err) {
            console.error('Delete user error:', err);
            return res.status(500).json({ success: false, message: 'ลบสมาชิกไม่สำเร็จ อาจมีข้อมูลการจองเชื่อมอยู่' });
        }
        res.json({ success: true, message: 'ลบสมาชิกสำเร็จ' });
    });
});

app.post('/api/add-schedule', (req, res) => {
    const { driver_id, route_name, departure_date, departure_time, price } = req.body;

    if (!driver_id || !route_name || !departure_date || !departure_time || price === undefined) {
        return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลรอบรถให้ครบถ้วน' });
    }

    const sql = 'INSERT INTO schedules (driver_id, route_name, departure_date, departure_time, price) VALUES (?, ?, ?, ?, ?)';
    db.query(sql, [driver_id, route_name, departure_date, normalizeTime(departure_time), price], (err, result) => {
        if (err) {
            console.error('Add schedule error:', err);
            return res.status(500).json({ success: false, message: 'บันทึกรอบรถไม่สำเร็จ' });
        }
        res.json({ success: true, message: 'บันทึกรอบรถสำเร็จ', schedule_id: result.insertId });
    });
});

function findOrCreateSchedule({ driverId, bookingDate, travelTime }, callback) {
    const departureTime = normalizeTime(travelTime);
    const findSql = `
        SELECT schedule_id
        FROM schedules
        WHERE driver_id = ? AND departure_date = ? AND departure_time = ?
        ORDER BY schedule_id DESC
        LIMIT 1
    `;

    db.query(findSql, [driverId, bookingDate, departureTime], (findErr, rows) => {
        if (findErr) return callback(findErr);
        if (rows.length > 0) return callback(null, rows[0].schedule_id);

        const insertSql = `
            INSERT INTO schedules (driver_id, route_name, departure_date, departure_time, price)
            VALUES (?, ?, ?, ?, 180.00)
        `;
        db.query(insertSql, [driverId, routeNameForDriver(driverId), bookingDate, departureTime], (insertErr, result) => {
            if (insertErr) return callback(insertErr);
            callback(null, result.insertId);
        });
    });
}

app.post('/api/book', (req, res) => {
    const { user_id, schedule_id, seat_number, booking_date, travel_time } = req.body;

    if (!user_id || !schedule_id || !seat_number || !booking_date) {
        return res.status(400).json({ success: false, message: 'ข้อมูลการจองไม่ครบถ้วน' });
    }

    findOrCreateSchedule({
        driverId: schedule_id,
        bookingDate: booking_date,
        travelTime: travel_time
    }, (scheduleErr, actualScheduleId) => {
        if (scheduleErr) {
            console.error('Schedule error:', scheduleErr);
            return res.status(500).json({ success: false, message: 'เตรียมรอบรถไม่สำเร็จ' });
        }

        const checkSql = `
            SELECT booking_id
            FROM bookings
            WHERE schedule_id = ? AND seat_number = ? AND booking_date = ? AND status = 'confirmed'
            LIMIT 1
        `;
        db.query(checkSql, [actualScheduleId, seat_number, booking_date], (checkErr, rows) => {
            if (checkErr) {
                console.error('Seat check error:', checkErr);
                return res.status(500).json({ success: false, message: 'ตรวจสอบที่นั่งไม่สำเร็จ' });
            }

            if (rows.length > 0) {
                return res.json({ success: false, message: 'ที่นั่งนี้มีผู้โดยสารท่านอื่นจองไปแล้ว' });
            }

            const insertSql = `
                INSERT INTO bookings (user_id, schedule_id, seat_number, booking_date, status)
                VALUES (?, ?, ?, ?, 'confirmed')
            `;
            db.query(insertSql, [user_id, actualScheduleId, seat_number, booking_date], (insertErr, result) => {
                if (insertErr) {
                    console.error('Booking error:', insertErr);
                    return res.status(500).json({ success: false, message: 'บันทึกการจองไม่สำเร็จ' });
                }

                res.json({
                    success: true,
                    message: 'จองที่นั่งเรียบร้อยแล้ว',
                    booking_id: result.insertId,
                    schedule_id: actualScheduleId
                });
            });
        });
    });
});

app.get('/api/booked-seats', (req, res) => {
    const { schedule_id, booking_date, travel_time } = req.query;

    if (!schedule_id || !booking_date) {
        return res.status(400).json({ success: false, message: 'กรุณาระบุรอบรถและวันที่เดินทาง' });
    }

    const params = [schedule_id, booking_date];
    let timeFilter = '';
    if (travel_time) {
        timeFilter = 'AND s.departure_time = ?';
        params.push(normalizeTime(travel_time));
    }

    const sql = `
        SELECT b.seat_number
        FROM bookings b
        JOIN schedules s ON b.schedule_id = s.schedule_id
        WHERE s.driver_id = ?
          AND b.booking_date = ?
          ${timeFilter}
          AND b.status = 'confirmed'
    `;

    db.query(sql, params, (err, results) => {
        if (err) {
            console.error('Booked seats error:', err);
            return res.status(500).json({ success: false, message: 'ดึงข้อมูลที่นั่งไม่สำเร็จ' });
        }
        res.json({ success: true, bookedSeats: results.map((row) => row.seat_number) });
    });
});

app.get('/api/bookings', (req, res) => {
    const sql = `
        SELECT
            b.booking_id,
            b.user_id,
            u.full_name,
            u.phone,
            b.schedule_id,
            s.driver_id,
            s.route_name,
            s.departure_time,
            b.seat_number,
            b.booking_date,
            b.status
        FROM bookings b
        LEFT JOIN users u ON b.user_id = u.user_id
        LEFT JOIN schedules s ON b.schedule_id = s.schedule_id
        ORDER BY b.booking_id DESC
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error('Load bookings error:', err);
            return res.status(500).json({ success: false, message: err.message });
        }
        res.json({ success: true, data: results });
    });
});

app.put('/api/bookings/:id', (req, res) => {
    const { seat_number, status } = req.body;
    const sql = 'UPDATE bookings SET seat_number = ?, status = ? WHERE booking_id = ?';

    db.query(sql, [seat_number, status, req.params.id], (err) => {
        if (err) {
            console.error('Update booking error:', err);
            return res.status(500).json({ success: false, message: 'แก้ไขข้อมูลการจองไม่สำเร็จ' });
        }
        res.json({ success: true, message: 'แก้ไขข้อมูลการจองสำเร็จ' });
    });
});

app.delete('/api/bookings/:id', (req, res) => {
    const sql = 'DELETE FROM bookings WHERE booking_id = ?';

    db.query(sql, [req.params.id], (err) => {
        if (err) {
            console.error('Delete booking error:', err);
            return res.status(500).json({ success: false, message: 'ลบข้อมูลการจองไม่สำเร็จ' });
        }
        res.json({ success: true, message: 'ลบข้อมูลการจองสำเร็จ' });
    });
});

app.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}`);
});
