require('dotenv').config()
const express = require('express');
const jwt = require('jsonwebtoken')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const app = express();
const cors = require('cors');
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send('Unauthorized access')
  }

  const token = authHeader.split(' ')[1];

  jwt.verify(token, process.env.JWT_TOKEN_SECRET, (error, decoded) => {
    if (error) {
      return res.status(403).send({
        message: "forbidden access"
      })
    }
    req.decoded = decoded
    next();
  })
}

const uri = `mongodb+srv://${ process.env.DB_USER }:${ process.env.DB_PASS }@cluster0.vmiugbh.mongodb.net/?retryWrites=true&w=majority`;


// Database: Client Create
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// Database: Connect with Database
const dbConnect = async () => {
  try {
    await client.connect();
    console.log("Database Connected Successfully");

  } catch (error) {
    console.log(error.name, error.message);

  }
}
dbConnect()

// Database: collections
const menuCollection = client.db("bistroDb").collection("menu");
const reviewCollection = client.db("bistroDb").collection("reviews");
const cartCollection = client.db("bistroDb").collection("carts");
const userCollection = client.db("bistroDb").collection("users");
const paymentCollection = client.db("bistroDb").collection("payments");

// routes: Default
app.get('/', (req, res) => {
  try {
    res.send('Restaurant Server Is Running 🚩')
  } catch (error) {
    console.log(error.name, error.message);
  }
})

app.post('/jwt', (req, res) => {
  const user = req.body;
  const token = jwt.sign(user, process.env.JWT_TOKEN_SECRET, { expiresIn: '7D' })
  res.send({ token });
})

// middleware: verify admin middleware
const verifyAdmin = async (req, res, next) => {
  const email = req.decoded.email;
  const query = { email: email };
  const user = await userCollection.findOne(query);

  if (user?.role !== 'admin') {
    res.status(403).send({ message: 'Forbidden Access' })
  }

  next()
}

// Route: All menu routes
app.get('/menu', async (req, res) => {
  const query = {}
  const result = await menuCollection.find(query).toArray();
  res.send(result);
})

app.post('/menu', verifyJWT, verifyAdmin, async (req, res) => {
  const addData = req.body;
  const result = await menuCollection.insertOne(addData);
  res.send(result)
})

app.delete('/menu/:id', verifyJWT, verifyAdmin, async (req, res) => {
  const id = req.params.id;
  const query = { _id: new ObjectId(id) };
  const result = await menuCollection.deleteOne(query);
  res.send(result)
})


app.get('/reviews', async (req, res) => {
  const query = {}
  const result = await reviewCollection.find(query).toArray();
  res.send(result);
})


// post: cart data
app.get('/carts', verifyJWT, async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) {
      res.send([])
    }

    // check valid user
    const decodedEmail = req.decoded.email;
    if (email !== decodedEmail) {
      res.status(403).send({ message: 'Forbidden Access' })
    }


    const query = { userEmail: email }
    const result = await cartCollection.find(query).toArray();
    res.send(result)

  } catch (error) {
    console.log(error.message);
  }
})
app.post('/carts', async (req, res) => {
  try {
    const item = req.body;
    const result = await cartCollection.insertOne(item);
    res.send(result)

  } catch (error) {
    console.log(error.message);
  }
})

app.delete('/carts/:id', async (req, res) => {
  const id = req.params.id;
  const query = { _id: new ObjectId(id) };

  const result = await cartCollection.deleteOne(query);
  res.send(result)
})

// section: All users routes
// get: single User
app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
  const query = {};
  const result = await userCollection.find(query).toArray();
  res.send(result)
})
// Add: a new User
app.post('/users', async (req, res) => {
  const user = req.body;
  const query = { email: user.email };
  const existingUser = await userCollection.findOne(query)
  if (existingUser) {
    return res.send({ message: "User Is already Registered!" })
  } else {
    const result = await userCollection.insertOne(user);
    res.send(result)
  }
})

// delete a user From database
app.delete('/users/:id', async (req, res) => {
  const id = req.params.id;
  const query = { _id: new ObjectId(id) };

  const result = await userCollection.deleteOne(query);
  res.send(result)
})

// Update: Admin Roll
app.patch('/users/admin/:id', async (req, res) => {
  const id = req.params.id;
  const filter = { _id: new ObjectId(id) };
  const updateDoc = {
    $set: { role: "admin" }
  };
  const result = await userCollection.updateOne(filter, updateDoc);
  res.send(result);
});

// Check admin or not
// user security layer check
// 01: verifyJWT
// 02: similar email
// 03: check role admin or not.
app.get('/users/admin/:email', verifyJWT, async (req, res) => {
  const email = req.params.email;
  if (req.decoded.email !== email) {
    res.send({ admin: false });
  }
  const query = { email: email };
  const user = await userCollection.findOne(query);
  const result = { admin: user?.role === 'admin' };
  res.send(result)
})


//* Payment: create payment intent
app.post('/create-payment-intent', verifyJWT, async (req, res) => {
  try {
    const { price } = req.body;
    const amount = price * 100;

    const paymentIntent = await stripe.paymentIntents.create({
      currency: 'usd',
      amount: amount,
      "payment_method_types": [
        "card"
      ]

    })
    res.send({
      clientSecret: paymentIntent.client_secret,
    });


  } catch (error) {
    res.send({
      success: false,
      error: error.message

    })
  }
})

app.post('/payments', verifyJWT, async (req, res) => {
  try {
    const payment = req.body;
    const result = await paymentCollection.insertOne(payment);
    res.send(result)

  } catch (error) {
    res.send({
      error: error
    })
  }
})

app.get('/payments', async (req, res) => {
  try {
    const query = {};
    const payment = await paymentCollection.find(query).toArray();
    res.send(payment)

  } catch (error) {
    res.send(error)
  }
})

app.listen(port, () => {
  console.log(`Bistro boss is sitting on port ${ port }`);
})