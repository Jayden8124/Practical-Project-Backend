const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");
const multer = require("multer");
const path = require("path");
const cron = require('node-cron');
const bcrypt = require("bcrypt");

const app = express();
const port = 5000;

// Middleware setup
app.use(cors({
  origin: '*',
  methods: 'GET,POST,PUT,DELETE',
}));
app.use(express.json());

// Set up static folder to serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Set up storage for uploaded files
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
  user: "root",
  password: "",
  database: "db_669",
});

// Cron job to reset completed tasks at midnight
cron.schedule('0 0 * * *', () => {
  pool.query(
    "UPDATE task SET completed = 0, updated_at = CURRENT_TIMESTAMP() WHERE completed = 1",
    (error, results) => {
      if (error) {
        console.error("Error resetting tasks: ", error);
      } else {
        console.log("Tasks reset successfully at midnight.");
      }
    }
  );
});


// User endpoints

// Sign up endpoint
app.post("/user", async (req, res) => {
  const startDate = new Date().toISOString().split("T")[0];
  const { firstName, lastName, phone, birth, email, password, rate, total = 0 } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    pool.query(
      "INSERT INTO users (firstName, lastName, phone, birth, startDate, password, email, rate, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [firstName, lastName, phone, birth, startDate, hashedPassword, email, rate, total],
      (error, results) => {
        if (error) {
          res.status(500).send("Error inserting user");
        } else {
          res.status(201).send("User inserted successfully");
        }
      }
    );
  } catch (error) {
    res.status(500).send("Error processing sign-up");
  }
});

// Sign in endpoint
app.post("/user/login", (req, res) => {
  const { email, password } = req.body;
  pool.query("SELECT * FROM users WHERE email = ?", [email], async (error, results) => {
    if (error) {
      res.status(500).send("Error fetching user");
    } else if (results.length === 0) {
      res.status(404).send("User not found");
    } else {
      const user = results[0];
      const isMatch = await bcrypt.compare(password, user.password);
      if (isMatch) {
        res.json({ message: "Login successful", email: user.email });
      } else {
        res.status(400).send("Invalid email or password");
      }
    }
  });
});

// Change password endpoint
app.put("/user/password", async (req, res) => {
  const { email, oldPassword, newPassword } = req.body;
  try {
    pool.query("SELECT * FROM users WHERE email = ?", [email], async (error, results) => {
      if (error) {
        return res.status(500).send("Error fetching user by email");
      } else if (results.length === 0) {
        return res.status(404).send("User not found");
      }
      const user = results[0];
      const isMatch = await bcrypt.compare(oldPassword, user.password);
      if (!isMatch) {
        return res.status(400).send("Old password is incorrect");
      }
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      pool.query(
        "UPDATE users SET password = ? WHERE email = ?",
        [hashedNewPassword, email],
        (error, results) => {
          if (error) {
            res.status(500).send("Error updating password");
          } else {
            res.status(200).send("Password updated successfully");
          }
        }
      );
    });
  } catch (error) {
    res.status(500).send("Error processing password change");
  }
});

// Update user's total income endpoint
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

// Image upload endpoint
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

// Task endpoints

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
      console.error("Error deleting task:", error);
      res.status(500).send("Error deleting task");
    } else if (results.affectedRows === 0) {
      res.status(404).send("Task not found");
    } else {
      res.status(200).send("Task deleted successfully");
    }
  });
});

// History endpoints

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

// GET history by email
app.get("/history/:email", (req, res) => {
  const { email } = req.params;
  pool.query(
    "SELECT * FROM history WHERE email = ?",
    [email],
    (error, results) => {
      if (error) {
        res.status(500).send("Error fetching history by email");
      } else {
        res.json(results);
      }
    }
  );
});

// POST a new history entry
app.post("/history", (req, res) => {
  const { action, email, time, income } = req.body;
  pool.query(
    "INSERT INTO history (action, email, time, income) VALUES (?, ?, ?, ?)",
    [action, email, time, income],
    (error, results) => {
      if (error) {
        res.status(500).send("Error inserting data into history");
      } else {
        res.status(201).send("Data inserted successfully");
      }
    }
  );
});

// Start server
app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
