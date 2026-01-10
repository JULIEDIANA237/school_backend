require("dotenv").config();
const app = require("./app");
/*const connectDB = require("./config/database");

connectDB();*/

const PORT = process.env.PORT || 4000;
app.listen(PORT, () =>
  console.log(`Server running on port ${PORT}`)
);
