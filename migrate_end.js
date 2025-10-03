const { MongoClient } = require('mongodb');

// MongoDB connection URI - replace with your actual connection string
const uri = "mongodb+srv://teja:teja0000@versant.ia46v3i.mongodb.net/suma_madam"; // Update with your database details

// Target date: October 6th, 6:00 PM
const targetDate = new Date('2025-10-06T18:00:00.000+00:00');

async function migrateEndDateTime() {
    const client = new MongoClient(uri);
    
    try {
        await client.connect();
        console.log('Connected to MongoDB');
        
        const database = client.db(); // Uses database from connection string
        const testsCollection = database.collection('tests'); // Replace 'tests' with your actual collection name
        
        // Update all documents in the collection
        const result = await testsCollection.updateMany(
            {}, // Empty filter to match all documents
            {
                $set: {
                    endDateTime: targetDate
                }
            }
        );
        
        console.log(`Successfully updated ${result.modifiedCount} documents`);
        console.log(`All test endDateTime fields set to: ${targetDate.toISOString()}`);
        
    } catch (error) {
        console.error('Error during migration:', error);
    } finally {
        await client.close();
        console.log('Database connection closed');
    }
}

// Run the migration
migrateEndDateTime();