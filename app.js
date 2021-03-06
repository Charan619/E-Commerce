if (process.env.NODE_ENV !== 'production') {
	require('dotenv').config()
  }
  
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY
  const stripePublicKey = process.env.STRIPE_PUBLIC_KEY
  const mysql_username = process.env.MYSQL_USERNAME
  const mysql_password = process.env.MYSQL_PASSWORD
  const database = process.env.DATABASE_NAME
var mysql = require('mysql');
var express = require('express');
var session = require('express-session');
var bodyParser = require('body-parser');
var path = require('path');
const multer=require('multer');
const stripe=require('stripe')(stripeSecretKey);
var connection = mysql.createConnection({
	host     : 'remotemysql.com',
	user     : 'kxNgZo8wRe',
	password : 'KPSrJDkTqW',
	database : 'kxNgZo8wRe'
});
var app = express();
app.use(session({
	secret: 'secret',
	resave: true,
	saveUninitialized: true
}));
app.set('view engine', 'hbs');
app.use(bodyParser.urlencoded({extended : true}));
app.use(bodyParser.json());
app.use(
	express.static(path.join(__dirname + '/UI'),{ index :false })
	);
app.get('/', function(request, response) {
	response.sendFile(path.join(__dirname + '/UI/index.html'));
});
app.post('/auth_login', function(request, response) {
	const { password,rollno } = request.body;
	if (rollno && password) {
		connection.query('SELECT * FROM accounts WHERE password = ? AND rollno = ?', [password, rollno], function(error, results, fields) {
			if(error){
				response.status(400).json({ message: "Incorrect Username and/or Password!"})
			}
			else if (results.length > 0) {
				request.session.loggedin = true;
				request.session.rollno = rollno;
				console.log("loggedin successfully");
				response.status(200).json({ message: "Login succesful", userid: results[0].id})
			} else {
				response.status(400).json({ message: "Incorrect Username and/or Password!"})
				console.log('Incorrect Username and/or Password!');
			}			
		});
	} else {
		response.status(400).json({ message: "Enter Username and/or Password!"})
		response.end();
	}
});
app.post('/auth_signup', function(request, response) {
	const { username,password,rollno } = request.body;
	if (username && password) {
		connection.query('SELECT * FROM accounts WHERE rollno = ?', [rollno], function(error, results, fields) {
            if(!error) {
                if (results.length > 0) {
                    response.status(400).json({message:"User already exists"})
                } else {
                    connection.query('insert into accounts (username,password,rollno) values(?,?,?)',[username,password,rollno],function(error1,results1){
						if(!error1) {
							response.status(200).json({ message: "Singup succesful", userid: results1.insertId})
						} else {
							response.status(400).json({message:"Unable to insert data"})
						}
					});		
                }
            } else {
                response.status(400).json({ message: "Incorrect Username and/or Password!"})
            }
		});
	} else {
		response.status(400).json({ message: "Enter Username and/or Password!"})
		response.end();
	}
});
app.get("/filter_products",function(req,res){
	const {min,max,offer1,offer2,category}=req.query;
	connection.query('SELECT * FROM products WHERE CATEGORY=? and price >= ? and price <= ? and offer >= ? and offer <= ?',[category,min,max,offer1,offer2],(error,results) => {
		if(error) {
			console.log(error)
		} else {
			res.render('items', {
				data: results,
				message: "success"
			})
		}
	});

})

const getProductsByType = (type,callback) => {
	connection.query('SELECT * FROM products WHERE CATEGORY=?',[type],(error,results) => {
		if(error) {
			callback(error,null);
		} else {
			callback(null,results);
		}
	});
}

app.get('/items', (req, res) => {
	const category=req.query.type;
	getProductsByType(category,(error,result)=>{
		if(error){
			res.send(error);
		}
		else{
			res.render('items', {
				data: result,
				message: "success"
			})
		}
	});
})
app.get('/cart', (req,res) => {
	const {userid} =req.query;
	connection.query('select products.name,products.category,products.price,products.offer,products.imgpath,cart.cartid from products join cart on products.id=cart.product_id where cart.user_id=?', [userid] ,function(error,results){		
		if(error){
			console.log(error)
		}
		else{
			var total=0;
			results.map(_res => {
				total+=_res.price;
			})
			res.render('cart',{
				data: results,
				total:total,
				stripePublicKey: stripePublicKey,
				message: "success"
			})
		}
});
})
app.post("/addtocart",(req,res) => {
	const { userId, productId} = req.body;
	connection.query('insert into cart (product_id,user_id) values(?,?)',[productId,userId],function(error,results){		
		if(error){
			console.log("cart not updated")
		}
		else{
			console.log("cart updated")
			res.status(200).json({ message: "Cart updated"})
		}
});
})
app.post("/updatecart",(req,res) => {
	const { cartid } = req.body;
	connection.query('delete from cart where cartid=?',[cartid],function(error,results){		
		if(error){
			console.log(error)
		}
		else{
			res.status(200).json({ message: "updated cart"})
		}
});
})
app.get('/cartSum',(req,res) => {
	const { userid } =req.query;
	connection.query('select sum(products.price) as cost from products join cart on products.id=cart.product_id where cart.user_id=?',[userid],function(error,result){
		if(error){
			console.log(error);
		}
		else{
			res.status(200).json({ message: "cart value", total: result[0].cost,userid:userid})
		}
	});
})
app.post('/order',(req,res) => {
	const { userid,total } = req.body
	connection.query('insert into orders (user_id,price) values(?,?)',[userid,total],function(error,results){		
		if(error){
			console.log(error)
		}
		else{
			console.log("order updated")
		}
});
})
app.post('/charge', (req, res) => {
	const { userid,name,email,price } = req.body
	try {
        stripe.customers.create({
            name: name,
            description: 'test description',
            email: email,
            source: 'tok_visa',
            address:{city:'erode', country:'india', line1:'anna nagar', line2:'erode', postal_code:'638012', state:'tn'}
        }).then(customer => stripe.charges.create({
            amount: parseInt(price)*100,
            currency: 'inr',
            customer: customer.id,
            description: 'Thank you for purchasing.'
        })).then(() => res.render('placed',{
			email:email,
			price:price
		}))
            .catch(err => console.log(err))
    } catch (err) { res.send(err) }
})

const storage = multer.diskStorage({
	destination:'./UI/images/',
	filename:function(req, file, callback) {
	  var files = file.originalname;
	  callback(null, files);
	}
  });
  const uploadImages = multer({
	storage: storage
  });
  app.post('/upload', uploadImages.single('file'),(req,res)=>{
	const {name,price,offer,category,description}=req.body
	if(!req.file){
		  res.send("enter a search file")
	  }
	  else{
		  const { file } = req
		  connection.query('INSERT INTO products (name,category,price,offer,imgpath,description) VALUES (?, ?, ?, ?, ?, ?)',[name,category,price,offer,"./images/"+req.file.filename,description], function(error, results){
			  if(error){
				  console.log("db not updated",error)

			  }
			  else{
				  console.log("updated successfully")
				  res.send("Uploaded successfully")
			  }
		  });
	  }
  })
  
app.listen(3000);