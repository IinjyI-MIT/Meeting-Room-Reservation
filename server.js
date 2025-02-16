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

  // Insert data for the next seven days with times from 9 AM to 5 PM
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

// Make a reservation
app.post("/api/reserve", async (req, res) => {
  const { email, reason, slots, date } = req.body;

  try {
    const reservations = await readReservations(date);

    slots.forEach((slotTime) => {
      const reservation = reservations.find((r) => r.time === slotTime);
      if (reservation) {
        reservation.state = "r";
        reservation.email = email;
        reservation.reason = reason;
      }
    });

    await writeReservations(reservations);

    // Send email confirmation
    let transporter = nodemailer.createTransport({
      host: "mail.measuresofteg.com",
      port: 465,
      secure: true,
      auth: {
        user: "reservation@measuresofteg.com",
        pass: "Rre$erv@t!0nmos",
      },
    });

    transporter.sendMail({
      from: "reservation@measuresofteg.com",
      to: email,
      subject: "Meeting Room Reservation Confirmation",
      text: `You have reserved the meeting room for: ${slots.join(", ")} on ${date}.\nReason: ${reason}`,
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error processing reservation" });
  }
});

app.get("/api/reset-reservations", async (req, res) => {
  try {
    console.log("Resetting reservations.");
    const reservations = await readReservations();
    const newReservations = [];

    // Get the current date and calculate the next week's dates
    const today = new Date();
    const times = Array.from({ length: 9 }, (_, i) => `${9 + i}:00`).map(convertTo12HourFormat);

    for (let i = 0; i < 7; i++) {
      const nextDate = new Date(today);
      nextDate.setDate(today.getDate() + i);
      const dateString = nextDate.toISOString().split('T')[0];

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