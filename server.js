const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');

const app = express();
const port = 5001;

const mongoUri = 'mongodb://localhost:27017';
const dbName = 'zom';
const collectionName = 'res';

const client = new MongoClient(mongoUri);
let isMongoConnected = false;

async function connectToMongo() {
    try {
        if (!isMongoConnected) {
            await client.connect();
            isMongoConnected = true;
            console.log("Connected to MongoDB");
        }
    } catch (err) {
        console.error(`Failed to connect to MongoDB: ${err}`);
    }
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

async function fetchRestaurants(query = '', page = 1, pageSize = 15) {
    try {
        const db = client.db(dbName);
        const collection = db.collection(collectionName);

        let searchQuery = {};
        if (query) {
            const idQuery = ObjectId.isValid(query) ? new ObjectId(query) : null;
            if (idQuery) {
                searchQuery = { _id: idQuery };
            } else {
                searchQuery = {
                    $or: [
                        { 'restaurant.id': query },
                        { 'restaurant.name': new RegExp(query, 'i') },
                        { 'restaurant.location.address': new RegExp(query, 'i') },
                        {'restaurant.user_rating.aggregate_rating':query},
                        { 'restaurant.cuisines': new RegExp(query, 'i') }
                    ]
                };
            }
        }

        console.log('Search query:', searchQuery);
        const skip = (page - 1) * pageSize;
        const restaurants = await collection.find(searchQuery).skip(skip).limit(pageSize).toArray();

        const totalRestaurants = await collection.countDocuments(searchQuery);
        const totalPages = Math.ceil(totalRestaurants / pageSize);

        console.log('Search results:', restaurants); 
        return { restaurants, totalPages };
    } catch (err) {
        console.error(`Failed to fetch data: ${err}`);
        return { restaurants: [], totalPages: 0 };
    }
}

const mem_cache = new Map();
const max_mem = 10;

async function fetchRestaurantById(id) {
    try {
        if (mem_cache.has(id)) {
            const restaurant = mem_cache.get(id);
            mem_cache.delete(id);
            mem_cache.set(id, restaurant);
            return restaurant;
        }

        const db = client.db(dbName);
        const collection = db.collection(collectionName);
        const restaurant = await collection.findOne({ 'restaurant.id': id });

        if (restaurant) {
            if (mem_cache.size >= max_mem) {
                const firstKey = mem_cache.keys().next().value;
                mem_cache.delete(firstKey);
            }
            mem_cache.set(id, restaurant);
        }

        console.log('Fetched from DB:', restaurant);
        return restaurant;
    } catch (err) {
        console.error(`Failed to fetch data: ${err}`);
        return null;
    }
}

app.get('/', async (req, res) => {
    await connectToMongo();
    const query = req.query.query || '';
    const page = parseInt(req.query.page) || 1;
    const { restaurants, totalPages } = await fetchRestaurants(query, page);
    res.render('template1', { restaurants, query, page, totalPages });
});

app.get('/web-api', async (req, res) => {
    await connectToMongo();
    const query = req.query.query || '';
    const page = parseInt(req.query.page) || 1;
    const { restaurants, totalPages } = await fetchRestaurants(query, page);
    res.json(restaurants);
});

app.get('/search', async (req, res) => {
    await connectToMongo();
    const query = req.query.query || '';
    const page = parseInt(req.query.page) || 1;
    const { restaurants, totalPages } = await fetchRestaurants(query, page);
    res.render('template1', { restaurants, query, page, totalPages });
});

app.get('/restaurant/:id', async (req, res) => {
    await connectToMongo();
    const restaurant = await fetchRestaurantById(req.params.id);
    if (!restaurant) {
        return res.status(404).send('Restaurant not found');
    }
    res.render('template2', { restaurant });
});

app.get('/web-api/restaurant/:id', async (req, res) => {
    await connectToMongo();
    const restaurant = await fetchRestaurantById(req.params.id);
    if (!restaurant) {
        return res.status(404).send('Restaurant not found');
    }
    res.json(restaurant);
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
