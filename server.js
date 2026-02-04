import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/", (req, res) => {
  res.send({
    status: "OK",
    message: "Eventify backend is running",
  });
});

app.get("/health", (req, res) => {
  res.send("healthy");
});

app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});
