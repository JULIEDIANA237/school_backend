import Period from "./period.model";

export default async function seedPeriods() {
  const periods = [
    {
      name: "Trimestre 1",
      year: "2024-2025",
      startDate: new Date("2024-09-01"),
      endDate: new Date("2024-12-20"),
      isActive: true
    },
    {
      name: "Trimestre 2",
      year: "2024-2025",
      startDate: new Date("2025-01-05"),
      endDate: new Date("2025-03-31")
    },
    {
      name: "Trimestre 3",
      year: "2024-2025",
      startDate: new Date("2025-04-01"),
      endDate: new Date("2025-06-15")
    }
  ];

  for (const period of periods) {
    const exists = await Period.findOne({ name: period.name, year: period.year });
    if (!exists) {
      await Period.create(period);
    }
  }

  console.log("📅 Periods seeded");
}
