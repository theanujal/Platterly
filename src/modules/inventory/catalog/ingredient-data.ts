/**
 * Platterly's master catalog of common catering ingredients (AJ, 2026-10-10). Pure data with no imports, so the seed
 * script can load it. Each line is "Name" or "Name | unit": the unit is only a suggestion (a section's default unit
 * applies when none is given) - the kitchen confirms or changes it when adding. The catalog holds no prices and no
 * stock: adding an ingredient creates an Inventory Item at zero stock.
 */
export interface IngredientSeed {
  name: string;
  categoryName: string;
  unit: string;
}

const SECTIONS: [category: string, defaultUnit: string, lines: string[]][] = [
  ["Grains & Cereals", "kg", [
    "Basmati Rice", "Sona Masoori Rice", "Ponni Rice", "Raw Rice", "Parboiled Rice", "Idli Rice", "Brown Rice", "Matta Rice",
    "Jeera Samba Rice", "Kolam Rice", "Poha (Flattened Rice)", "Thick Poha", "Murmura (Puffed Rice)", "Rava (Semolina)",
    "Bombay Rava", "Vermicelli (Semiya)", "Oats", "Corn Flakes", "Daliya (Broken Wheat)", "Sabudana (Sago)",
    "Ragi (Finger Millet)", "Jowar (Sorghum)", "Bajra (Pearl Millet)", "Foxtail Millet", "Barley", "Sweet Corn Kernels",
  ]],
  ["Pulses & Lentils", "kg", [
    "Toor Dal", "Chana Dal", "Moong Dal (Yellow)", "Moong Dal (Whole Green)", "Masoor Dal (Red Lentils)", "Masoor (Whole)",
    "Urad Dal (Split)", "Urad Dal (Whole Black)", "Rajma (Kidney Beans)", "Kabuli Chana (Chickpeas)", "Kala Chana (Black Chickpeas)",
    "White Peas (Safed Matar)", "Dried Green Peas", "Lobia (Black-eyed Peas)", "Horse Gram (Kulthi)", "Moth Beans",
    "Soya Chunks", "Soya Granules",
  ]],
  ["Flours", "kg", [
    "Wheat Flour (Atta)", "Multigrain Atta", "Maida (Refined Flour)", "Besan (Gram Flour)", "Rice Flour", "Corn Flour (Cornstarch)",
    "Ragi Flour", "Jowar Flour", "Bajra Flour", "Sattu", "Arrowroot Powder", "Bread Crumbs", "Panko Crumbs", "Idli Dosa Batter",
    "Baking Powder | g", "Baking Soda | g", "Yeast | g", "Custard Powder", "Cocoa Powder",
  ]],
  ["Spices & Masalas", "kg", [
    "Salt", "Rock Salt (Sendha Namak)", "Black Salt (Kala Namak)", "Turmeric Powder", "Red Chilli Powder", "Kashmiri Chilli Powder",
    "Coriander Powder", "Cumin Powder", "Garam Masala", "Chaat Masala", "Sambar Powder", "Rasam Powder", "Biryani Masala",
    "Chicken Masala", "Meat Masala", "Kitchen King Masala", "Pav Bhaji Masala", "Tandoori Masala", "Chole Masala", "Amchur (Dry Mango Powder)",
    "Black Pepper (Whole)", "Black Pepper Powder", "Cumin Seeds (Jeera)", "Mustard Seeds", "Fennel Seeds (Saunf)", "Fenugreek Seeds (Methi)",
    "Coriander Seeds (Dhaniya)", "Carom Seeds (Ajwain)", "Nigella Seeds (Kalonji)", "Poppy Seeds (Khus Khus)", "Sesame Seeds (Til)",
    "Cardamom (Elaichi)", "Cloves (Laung)", "Cinnamon (Dalchini)", "Bay Leaf (Tej Patta)", "Star Anise", "Mace (Javitri)", "Nutmeg (Jaiphal)",
    "Black Cardamom (Badi Elaichi)", "Kasuri Methi", "Dry Red Chilli", "Hing (Asafoetida) | g", "Saffron (Kesar) | g", "Tamarind (Imli)", "Kokum",
    "Ginger Garlic Paste", "Green Chilli Paste", "Tomato Puree", "Curry Leaves", "Oregano | g", "Chilli Flakes | g", "Mixed Herbs | g",
  ]],
  ["Oils & Ghee", "ltr", [
    "Sunflower Oil", "Refined Oil", "Groundnut Oil", "Coconut Oil", "Mustard Oil", "Sesame Oil (Gingelly)", "Olive Oil", "Rice Bran Oil",
    "Palm Oil", "Vanaspati | kg", "Desi Ghee | kg", "Cooking Margarine | kg",
  ]],
  ["Dairy", "kg", [
    "Milk (Full Cream) | ltr", "Milk (Toned) | ltr", "Curd (Dahi)", "Paneer", "Butter", "Fresh Cream | ltr", "Whipping Cream | ltr",
    "Processed Cheese", "Mozzarella Cheese", "Cheddar Cheese", "Cheese Slices | packet", "Khoya (Mawa)", "Condensed Milk", "Milk Powder",
    "Buttermilk | ltr", "Hung Curd",
  ]],
  ["Vegetables", "kg", [
    "Onion", "Tomato", "Potato", "Garlic", "Ginger", "Green Chilli", "Capsicum (Green)", "Capsicum (Red / Yellow)", "Carrot", "French Beans",
    "Cabbage", "Cauliflower", "Brinjal", "Ladyfinger (Okra)", "Bottle Gourd", "Ridge Gourd", "Bitter Gourd", "Pumpkin", "Ash Gourd",
    "Cucumber", "Beetroot", "Radish", "Spinach (Palak)", "Coriander Leaves", "Mint Leaves", "Fenugreek Leaves (Methi)", "Spring Onion",
    "Green Peas", "Sweet Corn", "Baby Corn", "Mushroom", "Broccoli", "Raw Banana", "Raw Mango", "Drumstick", "Cluster Beans",
    "Sweet Potato", "Colocasia (Arbi)", "Yam (Suran)", "Lemon", "Iceberg Lettuce", "Zucchini", "Celery", "Parsley", "Jalapeno", "Cherry Tomato",
  ]],
  ["Fruits", "kg", [
    "Banana | dozen", "Apple", "Orange", "Mosambi (Sweet Lime)", "Pineapple", "Watermelon", "Muskmelon", "Papaya", "Grapes", "Pomegranate",
    "Mango", "Guava", "Strawberry", "Kiwi", "Chikoo (Sapota)", "Custard Apple", "Lime", "Coconut | pcs", "Tender Coconut | pcs", "Mango Pulp",
  ]],
  ["Meat & Poultry", "kg", [
    "Chicken (Curry Cut)", "Chicken (Boneless)", "Chicken Breast", "Chicken Drumsticks", "Chicken Wings", "Chicken Mince (Keema)",
    "Mutton (Bone-in)", "Mutton (Boneless)", "Mutton Mince (Keema)", "Eggs | pcs",
  ]],
  ["Seafood", "kg", [
    "Seer Fish (Surmai)", "Rohu", "Pomfret", "Basa Fillet", "Prawns", "Crab", "Squid", "Tuna", "Mackerel (Bangda)", "Sardine",
  ]],
  ["Dry Fruits & Nuts", "kg", [
    "Cashew (Kaju)", "Almonds (Badam)", "Raisins (Kishmish)", "Pistachio (Pista)", "Walnuts", "Dates (Khajoor)", "Figs (Anjeer)",
    "Dry Coconut (Copra)", "Desiccated Coconut", "Peanuts (Groundnut)", "Roasted Peanuts", "Chironji", "Makhana (Fox Nuts)", "Prunes",
    "Dried Apricots", "Melon Seeds (Magaz)", "Flax Seeds", "Chia Seeds", "Pumpkin Seeds", "Sunflower Seeds",
  ]],
  ["Sugar & Sweeteners", "kg", [
    "Sugar", "Powdered Sugar", "Jaggery (Gud)", "Palm Jaggery", "Honey", "Rock Sugar (Mishri)", "Brown Sugar", "Glucose Powder", "Maple Syrup | bottle",
  ]],
  ["Beverages", "kg", [
    "Tea Powder", "Coffee Powder", "Instant Coffee Powder", "Green Tea Bags | box", "Soda | bottle", "Packaged Drinking Water | bottle",
    "Water Can (20 Ltr) | pcs", "Fruit Juice Concentrate | ltr", "Squash (Sharbat) | bottle", "Rose Syrup | bottle", "Jaljeera Powder",
    "Badam Milk Mix", "Malted Drink Powder",
  ]],
  ["Packaging & Disposables", "packet", [
    "Disposable Plates", "Disposable Paper Cups", "Disposable Glasses", "Disposable Spoons", "Disposable Forks", "Tissue Paper", "Aluminium Foil | pcs",
    "Cling Film | pcs", "Food Containers (Round)", "Meal Boxes", "Banana Leaves | pcs", "Paper Bags", "Butter Paper | pcs", "Garbage Bags",
    "Toothpicks", "Straws", "Parcel Covers", "Foil Containers",
  ]],
  ["Cleaning Supplies", "ltr", [
    "Dishwash Liquid", "Floor Cleaner", "Hand Wash", "Sanitizer", "Phenyl", "Bleach", "Detergent Powder | kg", "Scrubber | pcs", "Mop | pcs",
    "Disposable Gloves | box", "Hair Caps | packet", "Face Masks | box", "Cleaning Cloth | pcs",
  ]],
  ["Fuel & Gas", "pcs", [
    "LPG Cylinder (Commercial)", "Firewood | kg", "Charcoal | kg", "Diesel | ltr", "Kerosene | ltr", "Chafing Fuel Gel", "Coal | kg",
  ]],
  ["Other", "kg", [
    "Tomato Ketchup", "Soy Sauce | bottle", "Vinegar | bottle", "Green Chilli Sauce | bottle", "Red Chilli Sauce | bottle", "Schezwan Sauce | bottle",
    "Mayonnaise", "Mustard Sauce | bottle", "Pizza Sauce", "Pasta Sauce", "Pickle", "Papad | packet", "Hakka Noodles | packet", "Penne Pasta | packet",
    "Spaghetti | packet", "Macaroni | packet", "Sandwich Bread | packet", "Pav | packet", "Burger Buns | packet", "Pizza Base | packet",
    "Tofu", "Food Colour | g", "Vanilla Essence | bottle", "Cooking Chocolate", "Jelly Crystals | packet", "Olives | bottle",
  ]],
];

export const INGREDIENT_SEED: IngredientSeed[] = SECTIONS.flatMap(([categoryName, defaultUnit, lines]) =>
  lines.map((line) => {
    const [name, unit] = line.split(" | ");
    return { name: name.trim(), categoryName, unit: (unit ?? defaultUnit).trim() };
  }),
);
