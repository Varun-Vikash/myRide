$(document).ready(async () => {
  console.log("🚀 Initializing myRide@BIT Campus Shuttle Transit Platform...");

  // Initialize Map Viewport
  MapEngine.init();

  // Initialize Search Controller
  SearchEngine.init();

  // Initialize Real-time 60 FPS Bus Simulation Engine
  await SimulationEngine.init();

  console.log("✅ myRide@BIT Shuttle Tracking Platform initialized successfully.");
});
