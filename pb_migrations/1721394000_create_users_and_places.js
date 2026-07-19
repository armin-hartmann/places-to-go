migrate((app) => {
  // PocketBase includes a default "users" auth collection. Extend it instead
  // of replacing it so the migration is compatible with fresh installations.
  const users = app.findCollectionByNameOrId("users");
  users.fields.add(new SelectField({
    name: "role",
    required: true,
    maxSelect: 1,
    values: ["editor", "admin"],
    presentable: true
  }));
  users.listRule = null;
  users.viewRule = "id = @request.auth.id";
  users.createRule = null;
  users.updateRule = "id = @request.auth.id && @request.body.role:changed = false";
  users.deleteRule = null;
  users.authRule = 'role = "editor" || role = "admin"';
  users.passwordAuth = {
    enabled: true,
    identityFields: ["email"]
  };
  app.save(users);

  const editorRule = '@request.auth.role = "editor" || @request.auth.role = "admin"';
  const places = new Collection({
    type: "base",
    name: "places",
    listRule: `published = true || ${editorRule}`,
    viewRule: `published = true || ${editorRule}`,
    createRule: editorRule,
    updateRule: editorRule,
    deleteRule: '@request.auth.role = "admin"',
    fields: [
      {
        type: "text",
        name: "name",
        required: true,
        min: 1,
        max: 120,
        presentable: true
      },
      {
        type: "select",
        name: "type",
        required: true,
        maxSelect: 1,
        values: ["food", "bar", "experience"]
      },
      {
        type: "geoPoint",
        name: "location",
        required: true
      },
      {
        type: "text",
        name: "description",
        required: true,
        min: 1,
        max: 600
      },
      {
        type: "bool",
        name: "published"
      },
      {
        type: "number",
        name: "sortOrder",
        min: 0
      },
      {
        type: "relation",
        name: "createdBy",
        collectionId: users.id,
        maxSelect: 1,
        cascadeDelete: false
      }
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_places_name_nocase ON places (name COLLATE NOCASE)",
      "CREATE INDEX idx_places_published_sort ON places (published, sortOrder)"
    ]
  });
  app.save(places);

  const seedPlaces = [
    {
      name: "Virtue Feed & Grain",
      type: "food",
      lat: 38.8042,
      lon: -77.0406,
      description: "A lively, modern American tavern housed in a historic 1800s feed house."
    },
    {
      name: "Captain Gregory's",
      type: "bar",
      lat: 38.8092,
      lon: -77.0468,
      description: "An intimate, hidden cocktail speakeasy tucked away behind a secret door."
    },
    {
      name: "BARCA Pier & Wine Bar",
      type: "bar",
      lat: 38.8015,
      lon: -77.0401,
      description: "Built on a shipping pier over the Potomac River. Perfect for outdoor Spanish tapas."
    },
    {
      name: "Torpedo Factory Art Center",
      type: "experience",
      lat: 38.8048,
      lon: -77.0398,
      description: "A former WWII munitions factory transformed into three floors of open artist studios."
    },
    {
      name: "Stabler-Leadbeater Apothecary Museum",
      type: "experience",
      lat: 38.8046,
      lon: -77.0441,
      description: "A perfectly preserved 19th-century pharmacy featuring historic medicine bottles."
    }
  ];

  seedPlaces.forEach((place, index) => {
    const record = new Record(places);
    record.set("name", place.name);
    record.set("type", place.type);
    record.set("location", { lat: place.lat, lon: place.lon });
    record.set("description", place.description);
    record.set("published", true);
    record.set("sortOrder", (index + 1) * 10);
    app.save(record);
  });
}, (app) => {
  try {
    app.delete(app.findCollectionByNameOrId("places"));
  } catch {
    // The collection may already be absent during a partial rollback.
  }

  const users = app.findCollectionByNameOrId("users");
  users.fields.removeByName("role");
  users.listRule = null;
  users.viewRule = null;
  users.createRule = null;
  users.updateRule = null;
  users.deleteRule = null;
  users.authRule = "";
  app.save(users);
});
