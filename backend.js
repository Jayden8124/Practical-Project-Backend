const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");
const multer = require("multer");
const path = require("path");
const cron = require('node-cron');

const app = express();
const port = 5000;

app.use(cors({
  origin: '*',
  methods: 'GET,POST,PUT,DELETE',
}));

app.use(express.json());

// Set up static folder to serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Set up storage for uploaded files using multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage });

const pool = mysql.createPool({
  host: "localhost",
  user: "root", // Your MySQL username
  password: "", // Your MySQL password
  database: "db_669", // Your database name
});

// Cron job to reset completed tasks at midnight
cron.schedule('0 0 * * *', () => {
  pool.query(
    "UPDATE task SET completed = 0, lastResetDate = CURDATE() WHERE completed = 1 AND (lastResetDate IS NULL OR lastResetDate < CURDATE())",
    (error, results) => {
      if (error) {
        console.error("Error resetting tasks: ", error);
      } else {
        console.log("Tasks reset successfully at midnight.");
      }
    }
  );
});

// Endpoint to handle image upload
app.put("/user/image", upload.single('profileImage'), (req, res) => {
  const { email } = req.query;
  const profileImage = req.file ? `/uploads/${req.file.filename}` : '/uploads/default-profile.png';

  pool.query(
    "UPDATE users SET profileImage = ? WHERE email = ?",
    [profileImage, email],
    (error, results) => {
      if (error) {
        res.status(500).send("Error updating profile image");
      } else {
        res.json({ profileImage });
      }
    }
  );
});


cron.schedule('0 0 * * *', () => {
  pool.query(
    "UPDATE task SET completed = 0, lastResetDate = CURDATE() WHERE completed = 1 AND (lastResetDate IS NULL OR lastResetDate < CURDATE())",
    (error, results) => {
      if (error) {
        console.error("Error resetting tasks: ", error);
      } else {
        console.log("Tasks reset successfully at midnight.");
      }
    }
  );
});

// GET all users
app.get("/user", (req, res) => {
  pool.query("SELECT * FROM users", (error, results) => {
    if (error) {
      res.status(500).send("Error fetching users");
    } else {
      res.json(results);
    }
  });
});

// GET user by email
app.get("/user/:email", (req, res) => {
  const { email } = req.params;

  pool.query(
    "SELECT * FROM users WHERE email = ?",
    [email],
    (error, results) => {
      if (error) {
        res.status(500).send("Error fetching user by email");
      } else if (results.length === 0) {
        res.status(404).send("User not found");
      } else {
        res.json(results[0]);
      }
    }
  );
});

// POST a new user
app.post("/user", (req, res) => {
  const startDate = new Date().toISOString().split("T")[0];
  const { firstName, lastName, phone, birth, email, password, rate, total = 0} = req.body;
  pool.query(
    "INSERT INTO users (firstName, lastName, phone, birth, startDate, password, email, rate, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      firstName,
      lastName,
      phone,
      birth,
      startDate,
      password,
      email,
      rate,
      total
    ],
    (error, results) => {
      if (error) {
        
        res.status(500).send("Error inserting user");
      } else {
        res.status(201).send("User inserted successfully");
      }
    }
  );
});

// PUT to update a user's total income
app.put("/user/:email", (req, res) => {
  const { total, email } = req.body;

  pool.query(
    "UPDATE users SET total = ? WHERE email = ?",
    [total, email],
    (error, results) => {
      if (error) {
        res.status(500).send("Error updating user total income");
      } else {
        res.status(200).send("User total income updated successfully");
      }
    }
  );
});

// GET all tasks for a user
app.get("/tasks", (req, res) => {
  const { email } = req.query;
  pool.query("SELECT * FROM task WHERE email = ?", [email], (error, results) => {
    if (error) {
      res.status(500).send("Error fetching tasks");
    } else {
      res.json(results);
    }
  });
});

// POST a new task
app.post("/tasks", (req, res) => {
  const { email, nameTask, completed = 0 } = req.body;
  pool.query(
    "INSERT INTO task (email, nameTask, completed, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())",
    [email, nameTask, completed],
    (error, results) => {
      if (error) {
        res.status(500).send("Error inserting task");
      } else {
        res.status(201).send("Task inserted successfully");
      }
    }
  );
});

// PUT to update a task by task_id
app.put("/tasks", (req, res) => {
  const { task_id, nameTask, completed } = req.body;
  pool.query(
    "UPDATE task SET nameTask = ?, completed = ?, updated_at = NOW() WHERE task_id = ?",
    [nameTask, completed, task_id],
    (error, results) => {
      if (error) {
        res.status(500).send("Error updating task");
      } else {
        res.status(200).send("Task updated successfully");
      }
    }
  );
});

// DELETE a task by task_id
app.delete("/tasks/:task_id", (req, res) => {
  const { task_id } = req.params;

  pool.query("DELETE FROM task WHERE task_id = ?", [task_id], (error, results) => {
    if (error) {
      console.error("Error deleting task:", error); // เพิ่มการแสดงข้อผิดพลาดใน console
      res.status(500).send("Error deleting task");
    } else if (results.affectedRows === 0) {
      res.status(404).send("Task not found");
    } else {
      res.status(200).send("Task deleted successfully");
    }
  });
});


// GET all history
app.get("/history", (req, res) => {
  pool.query("SELECT * FROM history", (error, results) => {
    if (error) {
      res.status(500).send("Error fetching history");
    } else {
      res.json(results);
    }
  });
});

// POST a new history entry
app.post("/history", (req, res) => {
  const { action, email, time } = req.body;

  pool.query(
    "INSERT INTO history (action, email, time) VALUES (?, ?, ?)",
    [action, email, time],
    (error, results) => {
      if (error) {
        res.status(500).send("Error inserting data into history");
      } else {
        res.status(201).send("Data inserted successfully");
      }
    }
  );
});

// PUT to update a history entry
app.put("/history/:id", (req, res) => {
  const { id } = req.params;
  const { action, email, time } = req.body;

  pool.query(
    "UPDATE history SET action = ?, email = ?, time = ? WHERE id = ?",
    [action, email, time, id],
    (error, results) => {
      if (error) {
        res.status(500).send("Error updating history entry");
      } else {
        res.status(200).send("History entry updated successfully");
      }
    }
  );
});

// DELETE a history entry
app.delete("/history/:id", (req, res) => {
  const { id } = req.params;

  pool.query("DELETE FROM history WHERE id = ?", [id], (error, results) => {
    if (error) {
      res.status(500).send("Error deleting history entry");
    } else {
      res.status(200).send("History entry deleted successfully");
    }
  });
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
