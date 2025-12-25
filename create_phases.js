require("dotenv").config();
const { from } = require("./src/lib/db");

const PHASES = [
  { phase_num: 1, name: "Core Platform" },
  { phase_num: 2, name: "Code Development" },
  { phase_num: 3, name: "Creative/Graphics" },
  { phase_num: 4, name: "Web Development" },
  { phase_num: 5, name: "App Development" },
  { phase_num: 6, name: "Game Development" }
];

(async () => {
  const { data: existingPhases } = await from("dev_project_phases").select("project_id");
  const hasPhases = new Set(existingPhases?.map(p => p.project_id) || []);

  const { data: todos } = await from("dev_ai_todos").select("project_id");
  const todoProjectIds = [...new Set(todos?.filter(t => t.project_id).map(t => t.project_id) || [])];
  const needsPhases = todoProjectIds.filter(pid => !hasPhases.has(pid));

  console.log("Creating phases for", needsPhases.length, "projects");

  for (const projectId of needsPhases) {
    const { data: proj } = await from("dev_projects").select("name").eq("id", projectId).single();
    console.log("- Creating phases for:", proj?.name || projectId);

    for (const phase of PHASES) {
      const { error } = await from("dev_project_phases").insert({
        project_id: projectId,
        phase_num: phase.phase_num,
        name: phase.name,
        status: "planning",
        created_at: new Date().toISOString()
      });
      if (error) console.log("  Error:", error.message);
    }
  }
  
  // Verify
  const { data: allPhases } = await from("dev_project_phases").select("project_id");
  const uniqueProjects = new Set(allPhases?.map(p => p.project_id) || []);
  console.log("\nProjects with phases now:", uniqueProjects.size);
  
  process.exit(0);
})();
