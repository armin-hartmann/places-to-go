migrate((app) => {
  const places = app.findCollectionByNameOrId("places");
  places.fields.add(new TextField({ name: "address", max: 300 }));
  places.fields.add(new URLField({ name: "website", max: 300 }));
  app.save(places);
}, (app) => {
  const places = app.findCollectionByNameOrId("places");
  places.fields.removeByName("address");
  places.fields.removeByName("website");
  app.save(places);
});
