// Define available time slots (for example, from 9 AM to 5 PM)
const hours = [
    "09:00", "10:00", "11:00", "12:00", "13:00",
    "14:00", "15:00", "16:00", "17:00"
  ];
  
  // Render the schedule
  const scheduleDiv = document.getElementById("schedule");
  hours.forEach((time) => {
    const slot = document.createElement("div");
    slot.classList.add("slot");
    slot.dataset.time = time;
    slot.textContent = time;
    scheduleDiv.appendChild(slot);
  });
  
  // Function to mark reserved slots based on fetched reservation data
  const markReservedSlots = (reservations) => {
    reservations.forEach((reservation) => {
      reservation.slots.forEach((time) => {
        const slot = document.querySelector(`.slot[data-time="${time}"]`);
        if (slot) {
          slot.classList.remove("selected");
          slot.classList.add("reserved");
          // Create an overlay with reservation info
          const infoDiv = document.createElement("div");
          infoDiv.classList.add("info");
          infoDiv.innerHTML = `<strong>Reserved by:</strong><br>${reservation.email}<br><strong>Reason:</strong><br>${reservation.reason}`;
          slot.innerHTML = "";
          slot.appendChild(infoDiv);
        }
      });
    });
  };
  
  // Fetch reserved slots from the server when the page loads
  window.addEventListener("load", async () => {
    try {
      const response = await fetch("/reservations");
      const data = await response.json();
      markReservedSlots(data.reservations);
    } catch (error) {
      console.error("Error fetching reservations:", error);
    }
  });
  
  // Allow selection of available slots
  document.querySelectorAll(".slot").forEach((slot) => {
    slot.addEventListener("click", () => {
      // If already reserved, ignore clicks
      if (slot.classList.contains("reserved")) return;
      slot.classList.toggle("selected");
    });
  });
  
  // Modal handling and reservation form submission remain unchanged
  const modal = document.getElementById("reservationModal");
  const closeModal = document.querySelector(".modal .close");
  const reserveBtn = document.getElementById("reserveBtn");
  
  reserveBtn.addEventListener("click", () => {
    const selectedSlots = document.querySelectorAll(".slot.selected");
    if (selectedSlots.length === 0) {
      alert("Please select at least one available slot.");
      return;
    }
    modal.style.display = "block";
  });
  
  closeModal.addEventListener("click", () => {
    modal.style.display = "none";
  });
  
  window.addEventListener("click", (event) => {
    if (event.target === modal) {
      modal.style.display = "none";
    }
  });
  
  const reservationForm = document.getElementById("reservationForm");
  reservationForm.addEventListener("submit", async (e) => {
    e.preventDefault();
  
    const email = document.getElementById("email").value.trim();
    const reason = document.getElementById("reason").value.trim();
  
    // Gather selected slots
    const selectedSlots = Array.from(document.querySelectorAll(".slot.selected"))
      .map(slot => slot.dataset.time);
  
    if (selectedSlots.length === 0) {
      alert("No slots selected.");
      return;
    }
  
    // Send reservation data to the server
    try {
      const response = await fetch("/reserve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, reason, slots: selectedSlots })
      });
      const data = await response.json();
  
      if (data.success) {
        // Mark the newly reserved slots in the UI
        document.querySelectorAll(".slot.selected").forEach((slot) => {
          slot.classList.remove("selected");
          slot.classList.add("reserved");
          const infoDiv = document.createElement("div");
          infoDiv.classList.add("info");
          infoDiv.innerHTML = `<strong>Reserved by:</strong><br>${email}<br><strong>Reason:</strong><br>${reason}`;
          slot.innerHTML = "";
          slot.appendChild(infoDiv);
        });
        alert("Reservation confirmed! A confirmation email has been sent.");
      } else {
        alert("There was an error processing your reservation. Please try again.");
      }
    } catch (error) {
      console.error("Error:", error);
      alert("Error processing reservation.");
    }
  
    reservationForm.reset();
    modal.style.display = "none";
  });
  