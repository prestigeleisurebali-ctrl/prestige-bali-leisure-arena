/* ==================================================================
   CATEGORY EXPANSION — Master Product categories (the single list of
   main categories and sub-categories) and how each maps to a website
   marketplace category. Imported by db.js (Product Master) and by the
   CMS category defaults.
   ================================================================== */

/* main Product Master categories, each with its sub-categories */
export const NEW_CATEGORIES = [
  {
    id: "family", name: "Family, Leisure & Entertainment",
    subs: ["Family Activities & Experiences", "Family Packages", "Kids Activities & Entertainment", "Theme Parks & Water Parks", "Adventure Parks", "Indoor Entertainment", "Outdoor Activities", "Sports & Recreation", "Fun Attractions", "Private Family Experiences"],
    site: "family",
  },
  {
    id: "yacht-luxury", name: "Yacht & Luxury Charter",
    subs: ["Private Yacht Charter", "Luxury Yacht Charter", "Catamaran Charter", "Sailing Experiences", "Speedboat Charter", "Sunset Cruises", "Private Boat Trips", "Island Hopping", "Fishing Charters", "Yacht Celebration & Events"],
    site: "yacht-luxury",
  },
  {
    id: "events", name: "Celebrations & Events",
    subs: ["Birthday Celebrations", "Wedding & Honeymoon Experiences", "Anniversary Packages", "Private Dining Experiences", "Romantic Dinner Arrangements", "Marriage Proposals", "Private Parties", "Corporate Event Services", "Private Event Venues", "Event Planning & Decoration", "Special Occasion Packages"],
    site: "events",
  },
  {
    id: "culture", name: "Culture Immersion & Sightseeing",
    subs: ["Cultural Experiences", "Traditional Balinese Experiences", "Village Tours", "Temple Visits", "Heritage & Historical Tours", "Local Lifestyle Experiences", "Traditional Ceremonies & Workshops", "Guided Sightseeing", "Photography Tours", "Local Food Experiences", "Private Cultural Tours"],
    site: "culture",
  },
  {
    id: "premium", name: "Helicopter & Premium Experiences",
    subs: ["Private Helicopter Tours", "Scenic Helicopter Flights", "Aerial Sightseeing", "Private Luxury Experiences", "VIP Experiences", "Exclusive Private Tours", "Premium Adventure Experiences"],
    site: "premium",
  },
  {
    id: "classes", name: "Classes, Courses & Workshops",
    subs: ["Cooking Classes", "Balinese Cooking Classes", "Yoga Classes", "Meditation Classes", "Surfing Lessons", "Diving Courses", "Art & Painting Workshops", "Traditional Craft Workshops", "Dance Classes", "Music Classes", "Photography Classes", "Wellness Workshops", "Private Lessons & Training"],
    site: "classes",
  },
  {
    id: "wellness-spa", name: "Wellness & Spa",
    subs: ["Spa Treatments", "Traditional Balinese Massage", "Luxury Spa Experiences", "Body Treatments", "Facial Treatments", "Beauty Treatments", "Wellness Therapies", "Yoga Sessions", "Meditation Sessions", "Sound Healing", "Holistic Wellness", "Detox & Rejuvenation", "Mindfulness Experiences"],
    site: "wellness",
  },
  {
    id: "retreat-hosting", name: "Retreat Hosting & Wellness Venues",
    subs: ["Wellness Retreat Hosting", "Yoga Retreat Hosting", "Meditation Retreat Hosting", "Healing Retreat Hosting", "Spiritual Retreat Hosting", "Wellness Retreat Venues", "Private Retreat Accommodation", "Group Retreat Packages", "Retreat Venue Rental", "Retreat Facilities & Equipment", "Retreat Catering & Dining", "Retreat Transportation & Logistics", "Retreat Support Services"],
    site: "retreats",
  },
  {
    id: "healing", name: "Healing & Holistic Experiences",
    subs: ["Energy Healing", "Sound Healing", "Reiki", "Breathwork", "Chakra Balancing", "Traditional Healing Experiences", "Holistic Therapies", "Spiritual Guidance", "Meditation & Mindfulness", "Private Healing Sessions", "Group Healing Sessions"],
    site: "healing",
  },
  {
    id: "retreat-packages", name: "Wellness Retreat Packages",
    subs: ["Yoga Retreat Packages", "Meditation Retreat Packages", "Detox Retreat Packages", "Healing Retreat Packages", "Rejuvenation Retreat Packages", "Mindfulness Retreat Packages", "Holistic Wellness Packages", "Private Wellness Retreats", "Group Wellness Retreats", "Customized Wellness Retreats"],
    site: "retreats",
  },
  {
    id: "beauty", name: "Beauty & Grooming",
    subs: ["Hair Styling & Treatments", "Hair & Makeup Services", "Makeup Artists", "Nail Treatments", "Manicure & Pedicure", "Beauty Salon Services", "Men's Grooming", "Personal Styling", "Bridal Beauty Services", "Mobile Beauty Services", "Private Beauty & Grooming Packages"],
    site: "beauty",
  },
];

/* website marketplace categories for the new ranges (LEGACY_CATS in
   cmsCore.js is seeded from these plus the original ones) */
export const NEW_SITE_CATS = NEW_CATEGORIES.map((c) => ({ id: c.site, label: c.name, categoryIds: [c.id], visible: true, order: 90 }));

/* legacy product.category values that should flow into a new website category */
export const SITE_CATEGORY_ADDITIONS = {
  "Private vacation": "events",
};
