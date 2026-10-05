const express = require('express');

const {
  createPostcard,
  deletePostcard,
  generateDetailPanel,
  generatePostcardCaptionForPostcard,
  getHealth,
  getPostcardById,
  getRecentPostcards,
  sendPostcardEmailHandler,
  setPostcardFavorite,
} = require('../controllers/postcardController');
const { reverseGeocode } = require('../controllers/geolocationController');

const router = express.Router();

router.get('/health', getHealth);
router.get('/geolocation/reverse', reverseGeocode);
router.post('/send-postcard', sendPostcardEmailHandler);
router.get('/postcards', getRecentPostcards);
router.post('/postcards/detail-panel', generateDetailPanel);
router.post('/postcards/:id/generate-caption', generatePostcardCaptionForPostcard);
router.get('/postcards/:id', getPostcardById);
router.patch('/postcards/:id/favorite', setPostcardFavorite);
router.delete('/postcards/:id', deletePostcard);
router.post('/postcards', createPostcard);

module.exports = router;
