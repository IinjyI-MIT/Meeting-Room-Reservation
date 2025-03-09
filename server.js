const express = require("express");
const nodemailer = require("nodemailer");
const bodyParser = require("body-parser");
const { createClient } = require("@libsql/client");
const path = require("path");

const app = express();
app.use(bodyParser.json());
// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "public")));

// Serve index.html explicitly for the root path
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Simple middleware for basic auth protection
function adminAuthMiddleware(req, res, next) {
  // This is a very basic implementation - you should use more secure methods in production
  const AUTH_USERNAME = "admin";
  const AUTH_PASSWORD = "admin123"; // Change this to your preferred password

  // Check if Authorization header exists
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Access"');
    return res.status(401).send('Authentication required');
  }
  
  // Parse the Authorization header
  const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
  const username = auth[0];
  const password = auth[1];
  
  // Check if credentials match
  if (username === AUTH_USERNAME && password === AUTH_PASSWORD) {
    next();
  } else {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Access"');
    return res.status(401).send('Invalid credentials');
  }
}

// Serve admin page
app.get("/admin", adminAuthMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// Replace these with your actual Turso database credentials
const TURSO_URL = "libsql://meeting-room-reservation-iinjyi-mit.turso.io"; // Replace with your Turso URL
const TURSO_AUTH_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3MzkxMjg0MDMsImlkIjoiMDQ5ZjA2ZmEtODBiMC00OTk5LTk0NjEtZTA4OGUwYzVjYjZhIn0.-zkms14H4gU805AFLWqPjYzzsu2rnVGp2VZTxVf0PV0amnLzyjy4JHkdGP-G8W5kYSRKvloR2oLs-2ayhqDiAQ"; // Replace with your Turso auth token

const db = createClient({ url: TURSO_URL, authToken: TURSO_AUTH_TOKEN });

// Function to convert 24-hour time to 12-hour format with AM/PM
const convertTo12HourFormat = (time) => {
  const [hour, minute] = time.split(':');
  const hourInt = parseInt(hour, 10);
  const period = hourInt >= 12 ? 'PM' : 'AM';
  const hour12 = hourInt % 12 || 12;
  return `${hour12}:${minute} ${period}`;
};

// Ensure reservations table exists and insert initial data
async function initializeDatabase() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS reservations (
      time TEXT,
      date TEXT,
      state TEXT,
      email TEXT,
      reason TEXT,
      PRIMARY KEY (time, date)
    );
  `);

  // Check if the reservations table is empty
  const result = await db.execute("SELECT COUNT(*) as count FROM reservations");
  const count = result.rows[0].count;

  // If the table is empty, insert data for the next seven days with times from 9 AM to 5 PM
  if (count === 0) {
    const today = new Date();
    const times = Array.from({ length: 9 }, (_, i) => `${9 + i}:00`).map(convertTo12HourFormat);

    for (let i = 0; i < 7; i++) {
      const nextDate = new Date(today);
      nextDate.setDate(today.getDate() + i);
      const dateString = nextDate.toISOString().split('T')[0];

      const reservations = times.map(time => ({
        time,
        date: dateString,
        state: "f",
        email: "",
        reason: ""
      }));

      await writeReservations(reservations);
    }
  }
}
initializeDatabase();

// Read reservations from Turso
async function readReservations(date) {
  let result;
  if (date) {
    result = await db.execute("SELECT * FROM reservations WHERE date = ?", [date]);
  } else {
    result = await db.execute("SELECT * FROM reservations");
  }
  return result.rows;
}

// Write reservations to Turso
async function writeReservations(reservations) {
  const queries = reservations.map((res) => ({
    sql: `
      INSERT INTO reservations (time, date, state, email, reason)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(time, date) DO UPDATE SET 
        state = excluded.state,
        email = excluded.email,
        reason = excluded.reason;
    `,
    args: [res.time, res.date, res.state, res.email, res.reason],
  }));

  await db.batch(queries);
}

// Get reservations
app.get("/api/reservations", async (req, res) => {
  const { date } = req.query;
  try {
    const reservations = await readReservations(date);
    res.json({ reservations });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching reservations" });
  }
});


// Make a reservation - now sets state to pending ("p")
app.post("/api/reserve", async (req, res) => {
  const { email, reason, slots, date } = req.body;

  try {
    const reservations = await readReservations(date);

    slots.forEach((slotTime) => {
      const reservation = reservations.find((r) => r.time === slotTime);
      if (reservation) {
        // Set to pending state instead of reserved
        reservation.state = "p";
        reservation.email = email;
        reservation.reason = reason;
      }
    });

    await writeReservations(reservations);

    // Send email notification to user that their reservation is pending approval
    let transporter = nodemailer.createTransport({
      host: "mail.measuresofteg.com",
      port: 465,
      secure: true,
      auth: {
        user: "reservation@measuresofteg.com",
        pass: "Rre$erv@t!0nmos",
      },
    });
    try {
      await new Promise((resolve, reject) => {
        transporter.sendMail({
          from: "reservation@measuresofteg.com",
          to: email,
          subject: "Reservation of Meeting Room - Awaiting HR Approval",
          text: `Dear Requester,\n\nThank you for reserving the meeting room, your request for:\n\n${slots.join(", ")} on ${date}\nReason: ${reason}\n\nhas been received, and we kindly ask you to wait until the approval is confirmed by the HR department.\n\nShould you have any urgent concerns or require further assistance, please feel free to reach out.\n\nThank you for your understanding and cooperation.`,
        }, (error, info) => {
          if (error) {
            console.error('Email send error:', error);
            reject(error);
          } else {
            console.log('Email sent:', info.response);
            resolve(info);
          }
        });
      });
    } catch (emailError) {
      console.error('Failed to send email:', emailError);
      // Optionally, you can still return a successful reservation response
    }
    try {
      await new Promise((resolve, reject) => {
        transporter.sendMail({
          from: "reservation@measuresofteg.com",
          to: "hr@measuresofteg.com", 
          subject: "New Pending Meeting Room Reservation",
          text: `A new reservation request requires your approval:\n\nUser: ${email}\nDate: ${date}\nSlots: ${slots.join(", ")}\nReason: ${reason}\n\nPlease log in to the admin panel to approve or reject this request.`,
        }, (error, info) => {
          if (error) {
            console.error('Email send error:', error);
            reject(error);
          } else {
            console.log('Email sent:', info.response);
            resolve(info);
          }
        });
      });
    } catch (emailError) {
      console.error('Failed to send email:', emailError);
      // Optionally, you can still return a successful reservation response
    }

    res.json({ success: true, message: "Reservation request submitted and pending approval" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error processing reservation" });
  }
});

// Add these endpoints to the server.js file

// Get pending reservations
app.get("/api/pending-reservations", adminAuthMiddleware, async (req, res) => {
  try {
    const result = await db.execute("SELECT * FROM reservations WHERE state = 'p' ORDER BY date, time");
    res.json({ reservations: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching pending reservations" });
  }
});

// Get reserved reservations
app.get("/api/reserved-reservations", adminAuthMiddleware, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await db.execute("SELECT * FROM reservations WHERE state = 'r' AND date >= ? ORDER BY date, time", [today]);
    res.json({ reservations: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching reserved reservations" });
  }
});

// Fix the cancel-reservation endpoint to include the email parameter correctly
app.post("/api/admin/cancel-reservation", adminAuthMiddleware, async (req, res) => {
  const { date, time, email, rejectionReason } = req.body;

  try {
    // Get the email from the reservation if not provided in the request
    let userEmail = email;
    if (!userEmail) {
      const reservation = await db.execute(
        "SELECT email FROM reservations WHERE date = ? AND time = ?",
        [date, time]
      );
      if (reservation.rows.length > 0) {
        userEmail = reservation.rows[0].email;
      }
    }

    // Update the reservation status back to "f" (free)
    await db.execute(
      "UPDATE reservations SET state = 'f', email = '', reason = '' WHERE date = ? AND time = ?",
      [date, time]
    );

    // Send cancellation email to the user if we have an email
    if (userEmail) {
      let transporter = nodemailer.createTransport({
        host: "mail.measuresofteg.com",
        port: 465,
        secure: true,
        auth: {
          user: "reservation@measuresofteg.com",
          pass: "Rre$erv@t!0nmos",
        },
      });
      try {
        await new Promise((resolve, reject) => {
          transporter.sendMail({
            from: "reservation@measuresofteg.com",
            to: userEmail,
            subject: "Meeting Room Reservation Cancelled",
            text: `Your reservation for ${time} on ${date} has been cancelled.\nReason: ${rejectionReason || 'No reason provided.'}`
          }, (error, info) => {
            if (error) {
              console.error('Email send error:', error);
              reject(error);
            } else {
              console.log('Email sent:', info.response);
              resolve(info);
            }
          });
        });
      } catch (emailError) {
        console.error('Failed to send email:', emailError);
        // We still continue with successful response
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error cancelling reservation:", error);
    res.status(500).json({ success: false, message: "Error cancelling reservation" });
  }
});

// New endpoint for admin to approve a reservation
app.post("/api/admin/approve-reservation", async (req, res) => {
  const { date, time, email } = req.body;

  try {
    // Update the reservation status to "r" (reserved)
    await db.execute(
      "UPDATE reservations SET state = 'r' WHERE date = ? AND time = ?",
      [date, time]
    );

    // Send confirmation email to the user
    let transporter = nodemailer.createTransport({
      host: "mail.measuresofteg.com",
      port: 465,
      secure: true,
      auth: {
        user: "reservation@measuresofteg.com",
        pass: "Rre$erv@t!0nmos",
      },
    });

    try {
      await new Promise((resolve, reject) => {
        transporter.sendMail({
          from: "reservation@measuresofteg.com",
          to: email,
          subject: "Meeting Room Reservation Approved",
          text: `Your reservation for ${time} on ${date} has been approved.`
        }, (error, info) => {
          if (error) {
            console.error('Email send error:', error);
            reject(error);
          } else {
            console.log('Email sent:', info.response);
            resolve(info);
          }
        });
      });
    } catch (emailError) {
      console.error('Failed to send email:', emailError);
      // Optionally, you can still return a successful reservation response
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error approving reservation:", error);
    res.status(500).json({ success: false, message: "Error approving reservation" });
  }
});

// New endpoint for admin to reject a reservation
app.post("/api/admin/reject-reservation", async (req, res) => {
  const { date, time, email, rejectionReason } = req.body;

  try {
    // Update the reservation status back to "f" (free)
    await db.execute(
      "UPDATE reservations SET state = 'f', email = '', reason = '' WHERE date = ? AND time = ?",
      [date, time]
    );

    // Send rejection email to the user
    let transporter = nodemailer.createTransport({
      host: "mail.measuresofteg.com",
      port: 465,
      secure: true,
      auth: {
        user: "reservation@measuresofteg.com",
        pass: "Rre$erv@t!0nmos",
      },
    });
    try {
      await new Promise((resolve, reject) => {
        transporter.sendMail({
          from: "reservation@measuresofteg.com",
          to: email,
          subject: "Meeting Room Reservation Rejected",
          text: `Your reservation for ${time} on ${date} has been rejected.\nReason: ${rejectionReason || 'No reason provided.'}`
        }, (error, info) => {
          if (error) {
            console.error('Email send error:', error);
            reject(error);
          } else {
            console.log('Email sent:', info.response);
            resolve(info);
          }
        });
      });
    } catch (emailError) {
      console.error('Failed to send email:', emailError);
      // Optionally, you can still return a successful reservation response
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error rejecting reservation:", error);
    res.status(500).json({ success: false, message: "Error rejecting reservation" });
  }
});

app.get("/api/set-reservations-till-year-end", async (req, res) => {
  try {
    console.log("Setting reservations from today till December 31st.");
    const reservations = await readReservations();
    const newReservations = [];

    // Get the current date and calculate the dates till January 1st of the next year
    const today = new Date();
    const endOfYear = new Date(today.getFullYear() + 1, 0, 1); // January 1st of the next year
    const times = Array.from({ length: 9 }, (_, i) => `${9 + i}:00`).map(convertTo12HourFormat);

    for (let date = new Date(today); date < endOfYear; date.setDate(date.getDate() + 1)) {
      const dateString = date.toISOString().split('T')[0];

      times.forEach((time) => {
        newReservations.push({
          time,
          date: dateString,
          state: "f",
          email: "",
          reason: "",
        });
      });
    }

    await writeReservations(newReservations);
    res.json({ success: true });
  } catch (error) {
    console.error("Error setting reservations till year end:", error);
    res.status(500).json({ success: false, message: "Error setting reservations till year end" });
  }
});


app.get("/api/reset-reservations", async (req, res) => {
  try {
    console.log("Resetting reservations.");
    const reservations = await readReservations();
    const newReservations = [];

    // Calculate the next year's start date (January 1st) and end date (December 31st)
    const today = new Date();
    const nextYearStart = new Date(today.getFullYear() + 1, 0, 1); // January 1st of the next year
    const nextYearEnd = new Date(today.getFullYear() + 1, 11, 31); // December 31st of the next year
    const times = Array.from({ length: 9 }, (_, i) => `${9 + i}:00`).map(convertTo12HourFormat);

    for (let date = new Date(nextYearStart); date <= nextYearEnd; date.setDate(date.getDate() + 1)) {
      const dateString = date.toISOString().split('T')[0];

      times.forEach((time) => {
        newReservations.push({
          time,
          date: dateString,
          state: "f",
          email: "",
          reason: "",
        });
      });
    }

    await writeReservations(newReservations);
    res.json({ success: true });
  } catch (error) {
    console.error("Error resetting reservations:", error);
    res.status(500).json({ success: false, message: "Error resetting reservations" });
  }
});



// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});