const mongoose = require('mongoose');
const { Product } = require('./src/models');
mongoose.connect('mongodb://127.0.0.1:27017/haat').then(async () => {
  try {
    const p = await Product.find({ store: '6aba5a2833ca7d2e247d7ea2' }).populate({ path: 'store', select: 'name' }).limit(10);
    console.log("SUCCESS:", p);
  } catch (err) {
    console.log("ERROR:", err.name, err.message);
  }
  mongoose.disconnect();
});
