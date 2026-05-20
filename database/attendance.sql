CREATE TABLE attendance_reports (
    id INT PRIMARY KEY AUTO_INCREMENT,
    employee_name VARCHAR(255),
    attendance_date DATE,
    employee_status VARCHAR(50),
    checkin_status VARCHAR(50),
    checkout_status VARCHAR(50),
    productivity_score FLOAT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
