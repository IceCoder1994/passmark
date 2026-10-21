// 清理上一次截图用的临时 Edge 实例（只结束使用 pm-shot-profile / pm-edge-profile 的进程）
const { execFileSync } = await import("node:child_process");

const ps = `
Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" |
  Where-Object { $_.CommandLine -like '*pm-shot-profile*' -or $_.CommandLine -like '*pm-edge-profile*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
`;
execFileSync("powershell", ["-NoProfile", "-Command", ps], { stdio: "ignore" });
console.log("cleaned");
