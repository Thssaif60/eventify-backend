import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/", (_req, res) => {
  res.send({
    status: "OK",
    message: "Eventify Backend is running",
  });
});

app.get("/health", (_req, res) => {
  res.send("healthy");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
