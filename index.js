require('colors');
require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

//? create
const app = express();
const cors = require('cors');

// middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authHeader = req?.headers?.authorization;
  if (!authHeader) {
    return res.status(401).send('Unauthorized access');
  }

  const token = authHeader.split(' ')[1];

  jwt.verify(token, process.env.JWT_TOKEN_SECRET, (error, decoded) => {
    if (error) {
      return res.status(403).send({
        message: 'forbidden access',
      });
    }
    req.decoded = decoded;
    next();
  });
};

const uri =
	process.env.DB_URL ||
	`mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vmiugbh.mongodb.net/?retryWrites=true&w=majority`;

// Database: Client Create
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Database: Connect with Database
const dbConnect = async () => {
  try {
    client.connect();
    console.log('Database Connected Successfully✅');
  } catch (error) {
    console.log(error.name, error.message);
  }
};
dbConnect();

// Database: All database collections
const db = client.db('bistroDb');
const menuCollection = db.collection('menu');
const reviewCollection = db.collection('reviews');
const cartCollection = db.collection('carts');
const userCollection = db.collection('users');
const paymentCollection = db.collection('payments');
const orderCollection = db.collection('orders');
const inventoryCollection = db.collection('inventory');
const staffCollection = db.collection('staff');
const deliveryCollection = db.collection('deliveries');
const notificationCollection = db.collection('notifications');
const auditLogCollection = db.collection('auditLogs');

const seedOrders = [
  {
    orderId: 'DO-1048',
    customer: 'Ariana Silva',
    type: 'Delivery',
    status: 'Preparing',
    eta: '18 min',
    total: 42.5,
    priority: 'High',
    chef: 'Mina',
  },
  {
    orderId: 'DO-1049',
    customer: 'Noah Chen',
    type: 'Pickup',
    status: 'Ready',
    eta: 'Now',
    total: 28,
    priority: 'Normal',
    chef: 'Rafi',
  },
  {
    orderId: 'DO-1050',
    customer: 'Leah Ahmed',
    type: 'Dine-in',
    status: 'Accepted',
    eta: '24 min',
    total: 63.75,
    priority: 'Normal',
    chef: 'Mina',
  },
];

const seedInventory = [
  { item: 'Brioche buns', category: 'Bakery', stock: 28, threshold: 40, status: 'Low stock' },
  { item: 'Mozzarella', category: 'Dairy', stock: 84, threshold: 35, status: 'Healthy' },
  {
    item: 'Cold brew concentrate',
    category: 'Beverage',
    stock: 14,
    threshold: 20,
    status: 'Low stock',
  },
];

const seedStaff = [
  {
    name: 'Mina Rahman',
    role: 'Chef',
    shift: '11:00 - 19:00',
    attendance: 'Checked in',
    task: 'Grill station',
  },
  {
    name: 'Rafi Khan',
    role: 'Chef',
    shift: '12:00 - 20:00',
    attendance: 'Checked in',
    task: 'Expo and plating',
  },
  {
    name: 'Omar Lee',
    role: 'Cashier',
    shift: '10:00 - 18:00',
    attendance: 'Checked in',
    task: 'Counter',
  },
];

const seedDeliveries = [
  {
    deliveryId: 'DL-220',
    driver: 'Ibrahim',
    order: 'DO-1051',
    route: 'North loop',
    eta: '9 min',
    successRate: '97%',
  },
  {
    deliveryId: 'DL-221',
    driver: 'Nadia',
    order: 'DO-1048',
    route: 'Market district',
    eta: '18 min',
    successRate: '94%',
  },
];

const seedNotifications = [
  { audience: 'Customer', message: 'Order DO-1049 is ready for pickup.', type: 'Status update' },
  {
    audience: 'Staff',
    message: 'Brioche buns dropped below the reorder threshold.',
    type: 'Low inventory',
  },
  {
    audience: 'Kitchen',
    message: 'High-priority delivery order DO-1048 is preparing.',
    type: 'Kitchen alert',
  },
];

const withFallback = async (collection, fallback, query = {}) => {
  const result = await collection.find(query).toArray();
  return result.length ? result : fallback;
};

// routes: Default Route
app.get('/', (req, res) => {
  try {
    res.send('Restaurant Server Is Running 🚩');
  } catch (error) {
    console.log(error.name, error.message);
  }
});

// post: JWT middleware post request.
app.post('/jwt', (req, res) => {
  const user = req.body;
  const token = jwt.sign(user, process.env.JWT_TOKEN_SECRET, {
    expiresIn: '7D',
  });
  res.send({ token });
});

// middleware: verify admin middleware
const verifyAdmin = async (req, res, next) => {
  const email = req.decoded.email;
  const query = { email: email };
  const user = await userCollection.findOne(query);

  if (user?.role !== 'admin') {
    res.status(403).send({ message: 'Forbidden Access' });
  }
  next();
};

// Route: All menu routes
app.get('/menu', async (req, res) => {
  const query = {};
  const result = await menuCollection.find(query).toArray();
  res.send(result);
});

app.post('/menu', verifyJWT, verifyAdmin, async (req, res) => {
  const addData = req.body;
  const result = await menuCollection.insertOne(addData);
  res.send(result);
});

app.delete('/menu/:id', verifyJWT, verifyAdmin, async (req, res) => {
  const id = req.params.id;
  const query = { _id: new ObjectId(id) };
  const result = await menuCollection.deleteOne(query);
  res.send(result);
});

app.get('/reviews', async (req, res) => {
  const query = {};
  const result = await reviewCollection.find(query).toArray();
  res.send(result);
});

// get: cart data
app.get('/carts', verifyJWT, async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) {
      res.send([]);
    }
    // check valid user
    const decodedEmail = req.decoded.email;
    if (email !== decodedEmail) {
      res.status(403).send({ message: 'Forbidden Access' });
    }

    const query = { userEmail: email };
    const result = await cartCollection.find(query).toArray();
    res.send(result);
  } catch (error) {
    console.log(error.message);
  }
});

// post: cart data
app.post('/carts', async (req, res) => {
  try {
    const item = req.body;
    const result = await cartCollection.insertOne(item);
    res.send(result);
  } catch (error) {
    console.log(error.message);
  }
});

// delete: cart data
app.delete('/carts/:id', async (req, res) => {
  const id = req.params.id;
  const query = { _id: new ObjectId(id) };

  const result = await cartCollection.deleteOne(query);
  res.send(result);
});

// Get All user Information from database
app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
  const query = {};
  const result = await userCollection.find(query).toArray();
  res.send(result);
});

// Add a new User => Database
app.post('/users', async (req, res) => {
  const user = req.body;
  const query = { email: user.email };
  const existingUser = await userCollection.findOne(query);
  if (existingUser) {
    return res.send({ message: 'User Is already Registered!' });
  } else {
    const result = await userCollection.insertOne(user);
    res.send(result);
  }
});

// delete a user From database
app.delete('/users/:id', async (req, res) => {
  const id = req.params.id;
  const query = { _id: new ObjectId(id) };
  const result = await userCollection.deleteOne(query);
  res.send(result);
});

// Update:Modify User Admin Role
app.patch('/users/admin/:id', async (req, res) => {
  const id = req.params.id;
  const filter = { _id: new ObjectId(id) };
  const updateDoc = {
    $set: { role: 'admin' },
  };
  const result = await userCollection.updateOne(filter, updateDoc);
  res.send(result);
});

// Check isAdmin or not
// user security layer check
// 01: verifyJWT
// 02: similar email
// 03: check role admin or not.

//? verify Admin role
app.get('/users/admin/:email', verifyJWT, async (req, res) => {
  const email = req.params.email;
  if (req.decoded.email !== email) {
    res.send({ admin: false });
  }
  const query = { email: email };
  const user = await userCollection.findOne(query);
  const result = { admin: user?.role === 'admin' };
  res.send(result);
});

app.get('/users/admin/:email', async (req, res) => {
  const email = req.params.email;
  const query = { email: email };
  const user = await userCollection.findOne(query);
  const result = { admin: user?.role === 'admin' };
  res.send(result);
});

//* Payment: create payment intent
app.post('/create-payment-intent', verifyJWT, async (req, res) => {
  try {
    const { price } = req.body;
    const amount = price * 100;

    const paymentIntent = await stripe.paymentIntents.create({
      currency: 'usd',
      amount: amount,
      payment_method_types: ['card'],
    });
    res.send({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    res.send({
      success: false,
      error: error.message,
    });
  }
});

// post payment status to database.
app.post('/payments', verifyJWT, async (req, res) => {
  try {
    const payment = req.body;
    const result = await paymentCollection.insertOne(payment);
    res.send(result);
  } catch (error) {
    res.send({
      error: error,
    });
  }
});

// get: all payment Info from database
app.get('/payments', verifyJWT, async (req, res) => {
  try {
    const query = {};
    const payment = await paymentCollection.find(query).toArray();
    res.send(payment);
  } catch (error) {
    res.send(error);
  }
});

app.get('/admin-stats', verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const customers = await userCollection.estimatedDocumentCount();
    const products = await menuCollection.estimatedDocumentCount();
    const orders = await paymentCollection.estimatedDocumentCount();

    // best way to get sum of a field to use group and sum operator

    const payments = await paymentCollection.find().toArray();
    const revenue = payments.reduce((sum, current) => sum + current.price, 0);

    res.send({
      revenue,
      customers,
      products,
      orders,
    });
  } catch (error) {
    res.send(error);
  }
});

app.get('/dineos/overview', verifyJWT, async (req, res) => {
  try {
    const payments = await paymentCollection.find().toArray();
    const revenue = payments.reduce((sum, current) => sum + Number(current.price || 0), 0);
    const orders = await withFallback(orderCollection, seedOrders);
    const customers = await userCollection.estimatedDocumentCount();
    const inventory = await withFallback(inventoryCollection, seedInventory);
    const lowStock = inventory.filter(
      (item) => item.status === 'Low stock' || Number(item.stock) <= Number(item.threshold)
    ).length;

    res.send({
      revenue,
      orders: orders.length,
      customers,
      lowStock,
      healthScore: 92,
      insights: [
        'Burger sales increased 18% this week.',
        'Friday evenings generate the highest revenue.',
        'Beverage category outperformed desserts by 12%.',
      ],
    });
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

app.get('/orders', verifyJWT, async (req, res) => {
  const status = req.query.status;
  const query = status ? { status } : {};
  const result = await withFallback(orderCollection, seedOrders, query);
  res.send(result);
});

app.post('/orders', verifyJWT, async (req, res) => {
  const order = { ...req.body, createdAt: new Date(), status: req.body.status || 'Pending' };
  const result = await orderCollection.insertOne(order);
  res.send(result);
});

app.patch('/orders/:id/status', verifyJWT, async (req, res) => {
  const id = req.params.id;
  const { status, eta, chef } = req.body;
  const filter = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { orderId: id };
  const result = await orderCollection.updateOne(
    filter,
    { $set: { status, eta, chef, updatedAt: new Date() } },
    { upsert: false }
  );
  await notificationCollection.insertOne({
    audience: 'Customer',
    type: 'Status update',
    message: `Order ${id} moved to ${status}.`,
    createdAt: new Date(),
  });
  res.send(result);
});

app.get('/inventory', verifyJWT, async (req, res) => {
  const result = await withFallback(inventoryCollection, seedInventory);
  res.send(result);
});

app.post('/inventory', verifyJWT, verifyAdmin, async (req, res) => {
  const result = await inventoryCollection.insertOne({ ...req.body, createdAt: new Date() });
  res.send(result);
});

app.patch('/inventory/:id', verifyJWT, verifyAdmin, async (req, res) => {
  const id = req.params.id;
  const result = await inventoryCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { ...req.body, updatedAt: new Date() } }
  );
  res.send(result);
});

app.get('/staff', verifyJWT, verifyAdmin, async (req, res) => {
  const result = await withFallback(staffCollection, seedStaff);
  res.send(result);
});

app.post('/staff', verifyJWT, verifyAdmin, async (req, res) => {
  const result = await staffCollection.insertOne({ ...req.body, createdAt: new Date() });
  res.send(result);
});

app.patch('/staff/:id/shift', verifyJWT, verifyAdmin, async (req, res) => {
  const result = await staffCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    {
      $set: {
        shift: req.body.shift,
        attendance: req.body.attendance,
        task: req.body.task,
        updatedAt: new Date(),
      },
    }
  );
  res.send(result);
});

app.get('/deliveries', verifyJWT, async (req, res) => {
  const result = await withFallback(deliveryCollection, seedDeliveries);
  res.send(result);
});

app.post('/deliveries', verifyJWT, verifyAdmin, async (req, res) => {
  const result = await deliveryCollection.insertOne({ ...req.body, createdAt: new Date() });
  res.send(result);
});

app.get('/notifications', verifyJWT, async (req, res) => {
  const audience = req.query.audience;
  const query = audience ? { audience } : {};
  const result = await withFallback(notificationCollection, seedNotifications, query);
  res.send(result);
});

app.post('/notifications', verifyJWT, verifyAdmin, async (req, res) => {
  const result = await notificationCollection.insertOne({ ...req.body, createdAt: new Date() });
  res.send(result);
});

app.get('/reports/summary', verifyJWT, verifyAdmin, async (req, res) => {
  const payments = await paymentCollection.find().toArray();
  const orders = await withFallback(orderCollection, seedOrders);
  const inventory = await withFallback(inventoryCollection, seedInventory);
  const revenue = payments.reduce((sum, current) => sum + Number(current.price || 0), 0);
  res.send({
    revenueReport: {
      revenue,
      transactions: payments.length,
      exportOptions: ['CSV', 'Excel', 'PDF'],
    },
    salesReport: {
      orders: orders.length,
      topSellingDish: 'Smoked Brisket Burger',
      exportOptions: ['CSV', 'Excel', 'PDF'],
    },
    customerReport: {
      repeatCustomerRate: '64%',
      growth: '+14%',
      exportOptions: ['CSV', 'Excel', 'PDF'],
    },
    inventoryReport: {
      lowStock: inventory.filter((item) => item.status === 'Low stock').length,
      exportOptions: ['CSV', 'Excel', 'PDF'],
    },
  });
});

app.get('/audit-logs', verifyJWT, verifyAdmin, async (req, res) => {
  const result = await auditLogCollection.find({}).sort({ createdAt: -1 }).limit(100).toArray();
  res.send(result);
});

app.post('/audit-logs', verifyJWT, verifyAdmin, async (req, res) => {
  const result = await auditLogCollection.insertOne({
    ...req.body,
    actor: req.decoded.email,
    createdAt: new Date(),
  });
  res.send(result);
});

app.listen(port, () => {
  console.log(`Bistro boss is sitting on port ${port}`.bgRed);
});
