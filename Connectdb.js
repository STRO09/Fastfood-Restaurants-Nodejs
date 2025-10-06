const mysql =require('mysql')

const db = mysql.createConnection({
    host:"localhost",
    database: "httprestaurant",
    user: "root",
    password: "tfws.wow///POP()"
})

db.connect((err)=> {
    if(err) throw err;
    console.log("Connection successfully established");
})

module.exports = {db};
