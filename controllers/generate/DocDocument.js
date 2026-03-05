import pool from "../../config/dbconnect.js";
const generateDocNumber = async () => {
  const [rows] = await pool.query(
    "SELECT document_number FROM reimbursements ORDER BY id DESC LIMIT 1",
  );

  let number = 1;

  if (rows.length > 0 && rows[0].document_number) {
    const lastNumber = rows[0].document_number.split("-").pop();
    number = parseInt(lastNumber, 10) + 1;
  }

  const year = new Date().getFullYear();

  return `RB-${year}-${String(number).padStart(4, "0")}`;
};

export default generateDocNumber;
