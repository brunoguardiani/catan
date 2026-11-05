// Windows sandbox environments can make os.userInfo() fail before tsx starts.
// tsx only uses this value to name its temporary directory.
if (typeof process.geteuid !== "function") {
  process.geteuid = () => process.env.USERNAME || "local";
}
