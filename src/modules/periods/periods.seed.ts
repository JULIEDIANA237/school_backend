import Period from "./period.model";

export default async function seedPeriods() {
  const year = "2024-2025";
  
  // 1. Définir les Trimestres d'abord
  const trimestresData = [
    { name: "Trimestre 1", type: "TRIMESTRE", startDate: new Date("2024-09-01"), endDate: new Date("2024-12-20"), isActive: true },
    { name: "Trimestre 2", type: "TRIMESTRE", startDate: new Date("2025-01-05"), endDate: new Date("2025-03-31"), isActive: false },
    { name: "Trimestre 3", type: "TRIMESTRE", startDate: new Date("2025-04-01"), endDate: new Date("2025-06-15"), isActive: false },
  ];

  const trimestres = [];
  for (const data of trimestresData) {
    let t = await Period.findOneAndUpdate(
      { name: data.name, year },
      { ...data, year },
      { new: true, upsert: true }
    );
    trimestres.push(t);
  }

  // 2. Définir les Séquences liées aux Trimestres
  const sequencesData = [
    { name: "Séquence 1", parentIndex: 0, startDate: new Date("2024-09-01"), endDate: new Date("2024-10-15") },
    { name: "Séquence 2", parentIndex: 0, startDate: new Date("2024-10-16"), endDate: new Date("2024-12-20") },
    { name: "Séquence 3", parentIndex: 1, startDate: new Date("2025-01-05"), endDate: new Date("2025-02-15") },
    { name: "Séquence 4", parentIndex: 1, startDate: new Date("2025-02-16"), endDate: new Date("2025-03-31") },
    { name: "Séquence 5", parentIndex: 2, startDate: new Date("2025-04-01"), endDate: new Date("2025-05-15") },
    { name: "Séquence 6", parentIndex: 2, startDate: new Date("2025-05-16"), endDate: new Date("2025-06-15") },
  ];

  for (const data of sequencesData) {
    const exists = await Period.findOne({ name: data.name, year });
    if (!exists) {
      await Period.create({
        name: data.name,
        type: "SEQUENCE",
        year,
        startDate: data.startDate,
        endDate: data.endDate,
        parentPeriod: trimestres[data.parentIndex]._id,
        isActive: data.name === "Séquence 1" // Par exemple
      });
    }
  }

  console.log("📅 Periods & Sequences seeded");
}
