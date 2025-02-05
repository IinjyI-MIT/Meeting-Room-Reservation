const express = require("express");
const nodemailer = require("nodemailer");
const bodyParser = require("body-parser");
const path = require("path");
const cron = require("node-cron");
const fs = require("fs");

const app = express();

// Parse JSON bodies
app.use(bodyParser.json());

// Serve static files from the "public" folder
app.use(express.static(path.join(process.cwd(), "public")));

// Path to the reservations file
const reservationsFilePath = path.join(process.cwd(), "reservations.txt");

// Read reservation data from the text file
const readReservations = () => {
  const data = fs.readFileSync(reservationsFilePath, "utf-8");
  const reservations = data.split("\n").map(line => {
    const [time, info] = line.split(" : ");
    const [status, email, reason] = info.split(" ");
    return {
      time: time.replace(/"/g, "").trim(),
      status: status.replace(/"/g, "").trim(),
      email: email ? email.replace(/"/g, "").trim() : "",
      reason: reason ? reason.replace(/"/g, "").trim() : ""
    };
  });
  return reservations;
};

// Write reservation data to the text file
const writeReservations = (reservations) => {
  const data = reservations.map(reservation => {
    return `"${reservation.time}" : "${reservation.status}" "${reservation.email}" "${reservation.reason}"`;
  }).join("\n");
  fs.writeFileSync(reservationsFilePath, data, "utf-8");
};

// Endpoint to get all reservations
app.get("/reservations", (req, res) => {
  const reservations = readReservations();
  res.json({ reservations });
});

// Endpoint to handle reservation requests
app.post("/reserve", async (req, res) => {
  const { email, reason, slots } = req.body;

  console.log("Received reservation request:", req.body);

  // Read current reservations
  const reservations = readReservations();

  // Update reservations
  slots.forEach(slotTime => {
    const reservation = reservations.find(r => r.time === slotTime);
    if (reservation) {
      reservation.status = "r";
      reservation.email = email;
      reservation.reason = reason;
    }
  });

  // Write updated reservations to the file
  writeReservations(reservations);

  // Create a Nodemailer transporter with your SMTP settings
  let transporter = nodemailer.createTransport({
    host: "mail.measuresofteg.com",
    port: 465,
    secure: true,
    auth: {
      user: "reservation@measuresofteg.com",
      pass: "Rre$erv@t!0nmos" // replace with the actual password
    }
  });

  // Prepare the email
  const mailOptions = {
    from: "reservation@measuresofteg.com",
    to: email,
    subject: "Meeting Room Reservation Confirmation",
    text: `Hello,
    
You have reserved the meeting room for the following slots: ${slots.join(
      ", "
    )}.
Reason for reservation: ${reason}

Thank you!`
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Reservation successful:", { email, reason, slots });
    res.json({ success: true });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).json({ success: false, message: "Error processing reservation" });
  }
});

// Schedule a job to reset reservations at 12:00 AM everyday
cron.schedule("0 0 * * *", () => {
  console.log("Resetting reservations at midnight.");
  const reservations = readReservations();
  reservations.forEach(reservation => {
    reservation.status = "f";
    reservation.email = "";
    reservation.reason = "";
  });
  writeReservations(reservations);
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});