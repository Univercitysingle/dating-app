export default function handler(req, res) {
  // Example: Return dummy user info. Update logic as needed.
  res.status(200).json({
    user: {
      id: "123",
      email: "enadoctemp@gmail.com"
    }
  });
}
