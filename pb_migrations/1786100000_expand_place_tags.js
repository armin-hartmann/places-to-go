migrate((app) => {
  const places = app.findCollectionByNameOrId("places");
  places.fields.getByName("tags").values = [
    "American", "Brunch", "Casual", "Cocktails", "Coffee", "Date night",
    "Family-friendly", "Historic", "Italian", "Japanese", "Late night",
    "Outdoor seating", "Seafood", "Sushi", "Waterfront"
  ];
  app.save(places);
}, (app) => {
  const places = app.findCollectionByNameOrId("places");
  places.fields.getByName("tags").values = [
    "American", "Cocktails", "Coffee", "Family-friendly", "Historic", "Italian",
    "Late night", "Outdoor seating", "Seafood", "Waterfront"
  ];
  app.save(places);
});
