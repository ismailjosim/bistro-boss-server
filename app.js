require("dotenv").config()
const express = require("express");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY)

// middlewares
app.use(cors());
app.use(express.json());

// verify token middleware
const verifyToken = (req, res, next) => {
    if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
    }
    const token = req.headers.authorization.split(' ')[1];
    if (!token) {
        return res.status(401).send({ message: "unauthorized access" });
    }
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: "unauthorized access" })
        }
        req.decoded = decoded
        next();
    })

};


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${ process.env.DB_USER }:${ process.env.DB_PASS }@cluster0.gekes.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {

        const postDataCollection = client.db("InspireSphere").collection("postData")
        const userCollection = client.db("InspireSphere").collection("users")
        const announcementCollection = client.db("InspireSphere").collection("announcement")
        const paymentCollection = client.db("InspireSphere").collection("payment")


        // jwt related APIs
        app.post("/jwt", async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "2h" });
            res.send({ token });
        });



        // use verify admin after verifiAdmin
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email
            const query = { email: email }
            const user = await userCollection.findOne(query)

            if (user?.role !== 'admin') {
                res.status(403).send({ message: 'Forbidden Access' })
            }
            next()
        }

        // posts related APIs
        app.post("/allPosts", async (req, res) => {
            const postData = req.body;
            const result = await postDataCollection.insertOne(postData);
            res.send(result);
        });
        app.get("/allPosts", async (req, res) => {
            const { searchparams } = req.query;
            let option = {};
            if (searchparams) {
                option = { tag: { $regex: searchparams, $options: "i" } };
            };
            const result = await postDataCollection.find(option).toArray();
            res.send(result);
            // console.log(result);
        });
        app.get("/allPosts-email/:email", async (req, res) => {
            const email = req.params.email;
            const query = { authorEmail: email };
            const result = await postDataCollection.find(query).toArray();
            res.send(result);
        });
        app.get("/allPosts-details/:id", async (req, res) => {
            // console.log("Request Params:", req.params);
            const id = req.params.id;
            // console.log(id);
            const query = { _id: new ObjectId(id) };
            const result = await postDataCollection.findOne(query);
            res.send(result);
        });
        app.delete("/allPosts/:id", async (req, res) => {
            const id = req.params.id;
            // console.log(id);
            const query = { _id: new ObjectId(id) };
            // console.log(query);
            const result = await postDataCollection.deleteOne(query);
            res.send(result);
            // console.log(result);
        });

        // users related APIs
        app.post("/users", async (req, res) => {
            const user = req.body;
            const query = { email: user.email };
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send(existingUser)
            }
            const result = await userCollection.insertOne(user);
            res.send(result);
        });
        app.get("/users", async (req, res) => {
            // console.log(req.headers);
            const result = await userCollection.find().toArray();
            res.send(result);
        });
        app.get("/user/admin/:email", verifyToken, async (req, res) => {
            const email = req.params.email;
            const email = req.decoded.email
            const query = { email: email }
            if (user?.role !== 'admin') {
                res.status(403).send({ message: 'Forbidden Access' })
            }
            const user = await userCollection.findOne(query);
            let admin = false;
            if (user) {
                admin = user?.type === "admin"
            }
            res.send({ admin })
        })
        app.get("/user/admins/:type", async (req, res) => {
            const type = req.params.type;
            const query = { type: type };
            const user = await userCollection.find(query).toArray();
            res.send(user)
        });

        // admin related APIs
        app.patch("/users/admin/:id", verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    type: "admin"
                }
            };
            const result = await userCollection.updateOne(query, updatedDoc);
            res.send(result);
        });
        // announcement related APIs
        app.post("/announcement", verifyToken, async (req, res) => {
            const announcement = req.body;
            const result = await announcementCollection.insertOne(announcement);
            res.send(result);
            // console.log(result);
        });
        app.get("/announcement", async (req, res) => {
            const result = await announcementCollection.find().toArray();
            res.send(result);
        });
        // payment intent
        app.post("/create-payment-intent", async (req, res) => {
            const { amount } = req.body;
            const balance = parseInt(amount * 100);
            const paymentIntent = await stripe.paymentIntents.create({
                currency: "usd",
                amount: balance,
                payment_method_types: ["card"]
            });
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        });
        app.post('/payment', async (req, res) => {
            const payment = req.body;
            const paymentResult = await paymentCollection.insertOne(payment);
            res.send(paymentResult);
        });
        // app.get("/payments/:email", verifyToken, async (req, res) => {
        //     const email = req.params.email;
        //     const query = { email: email };
        //     if (req.params.email !== req.decoded.email) {
        //         return res.status(403).send({ message: "forbidden access" })
        //     }
        //     const result = await paymentCollection.find(query).toArray();
        //     res.send(result);
        // })


        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
    }
}
run().catch(console.dir);


app.get("/", (req, res) => {
    res.send("InspireSphere server is running now")
});
app.listen(port, () => {
    console.log(`InspireSphere is running on port ${ port }`);
});
