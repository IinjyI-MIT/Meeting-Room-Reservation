const express = require("express");
const nodemailer = require("nodemailer");
const bodyParser = require("body-parser");
const path = require("path");
const cron = require("node-cron");
const axios = require("axios");

const app = express();

// Parse JSON bodies
app.use(bodyParser.json());

// Serve static files from the "public" folder
app.use(express.static(path.join(process.cwd(), "public")));

// GitHub Gist API URL and token
const gistUrl = "https://api.github.com/gists/9c6ec58954cc894259ba585d2011a612";
const gistToken = "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"; // Replace with your GitHub token

// Read reservation data from the Gist
const readReservations = async () => {
  try {
    const response = await axios.get(gistUrl, {
      headers: {
        Authorization: `token ${gistToken}`
      }
    });
    const data = response.data.files["reservations.txt"].content;
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
  } catch (error) {
    console.error("Error reading reservations:", error);
    return [];
  }
};

// Write reservation data to the Gist
const writeReservations = async (reservations) => {
  try {
    const data = reservations.map(reservation => {
      return `"${reservation.time}" : "${reservation.status}" "${reservation.email}" "${reservation.reason}"`;
    }).join("\n");
    await axios.patch(gistUrl, {
      files: {
        "reservations.txt": {
          content: data
        }
      }
    }, {
      headers: {
        Authorization: `token ${gistToken}`
      }
    });
  } catch (error) {
    console.error("Error writing reservations:", error);
  }
};

// Endpoint to get all reservations
app.get("/reservations", async (req, res) => {
  try {
    const reservations = await readReservations();
    res.json({ reservations });
  } catch (error) {
    console.error("Error getting reservations:", error);
    res.status(500).json({ success: false, message: "Error getting reservations" });
  }
});

// Endpoint to handle reservation requests
app.post("/reserve", async (req, res) => {
  const { email, reason, slots } = req.body;

  console.log("Received reservation request:", req.body);

  try {
    // Read current reservations
    const reservations = await readReservations();

    // Update reservations
    slots.forEach(slotTime => {
      const reservation = reservations.find(r => r.time === slotTime);
      if (reservation) {
        reservation.status = "r";
        reservation.email = email;
        reservation.reason = reason;
      }
    });

    // Write updated reservations to the Gist
    await writeReservations(reservations);

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
  } catch (error) {
    console.error("Error processing reservation:", error);
    res.status(500).json({ success: false, message: "Error processing reservation" });
  }
});

// Schedule a job to reset reservations at 12:00 AM everyday
cron.schedule("0 0 * * *", async () => {
  console.log("Resetting reservations at midnight.");
  const reservations = await readReservations();
  reservations.forEach(reservation => {
    reservation.status = "f";
    reservation.email = "";
    reservation.reason = "";
  });
  await writeReservations(reservations);
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
