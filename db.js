const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");
const path = require("path");

const adapter = new FileSync(path.join(__dirname, "../plans.json"));
const db = low(adapter);

db.defaults({ plans: [], contacts: [], activeCheckin: null }).write();

module.exports = db;
