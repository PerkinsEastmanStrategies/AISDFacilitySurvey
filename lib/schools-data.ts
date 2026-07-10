export interface SchoolFeatureProperties {
  buildingName: string;
  schoolLevel: string;
  address: string;
  latitude: number;
  longitude: number;
}

export interface SchoolLocation extends SchoolFeatureProperties {
  /** [longitude, latitude] */
  coordinates: [number, number];
  /** Suffix used in floor plan filenames, e.g. ES, MS, HS. */
  planSuffix: string;
}

/** Map the raw GeoJSON CLASS code to a human-readable level/type. */
function classToLevel(cls: string): string {
  switch (cls) {
    case "ELEM":
      return "Elementary School";
    case "MID":
      return "Middle School";
    case "HIGH":
      return "High School";
    case "ALT ED 1":
      return "Alternative Education";
    case "ATHLETIC":
      return "Athletic Facility";
    case "DISTRICT":
      return "District Facility";
    default:
      return cls;
  }
}

/** Map CLASS codes to floor plan filename suffixes (`PILLOW ES.svg`, etc.). */
export function classToPlanSuffix(cls: string): string {
  switch (cls) {
    case "ELEM":
      return "ES";
    case "MID":
      return "MS";
    case "HIGH":
      return "HS";
    case "ALT ED 1":
      return "ALT";
    case "ATHLETIC":
      return "ATH";
    case "DISTRICT":
      return "DIST";
    default:
      return cls;
  }
}

/**
 * Austin ISD school/facility location data (source: AISD_Schools GeoJSON).
 * "NAME" is used as the canonical building identifier across the app.
 */
const RAW_FEATURES: { name: string; cls: string; address: string; longitude: number; latitude: number }[] = [
  { name: "LANGFORD", cls: "ELEM", address: "2206 BLUE MEADOW DRIVE", longitude: -97.763494373999947, latitude: 30.182084430000035 },
  { name: "LEE", cls: "ELEM", address: "3308 HAMPTON ROAD", longitude: -97.727397747999987, latitude: 30.293385324000045 },
  { name: "LINDER", cls: "ELEM", address: "2800 METCALFE ROAD", longitude: -97.737682118999942, latitude: 30.224447020000071 },
  { name: "MAPLEWOOD", cls: "ELEM", address: "3808 MAPLEWOOD AVE.", longitude: -97.71439634799998, latitude: 30.293175978000079 },
  { name: "MATHEWS", cls: "ELEM", address: "906 WEST LYNN STREET", longitude: -97.760907374999988, latitude: 30.278335810000048 },
  { name: "MENCHACA", cls: "ELEM", address: "12120 MENCHACA ROAD", longitude: -97.833658258999961, latitude: 30.141541306000079 },
  { name: "SITE 905", cls: "DISTRICT", address: "84 ROBERT T. MARTINEZ JR. STREET", longitude: -97.721906885999957, latitude: 30.254594719000071 },
  { name: "NORMAN-SIMS", cls: "ELEM", address: "4001 TANNEHILL LANE", longitude: -97.673929362999957, latitude: 30.27836370700004 },
  { name: "OAK SPRINGS", cls: "ELEM", address: "3601 WEBBERVILLE ROAD", longitude: -97.704594526999983, latitude: 30.271792072000043 },
  { name: "ODOM", cls: "ELEM", address: "1010 TURTLE CREEK BLVD.", longitude: -97.78932538, latitude: 30.20589298800007 },
  { name: "SITE 907", cls: "DISTRICT", address: "1203 SPRINGDALE ROAD", longitude: -97.686101315999963, latitude: 30.279456277000065 },
  { name: "ST ELMO", cls: "ELEM", address: "600 W. ST. ELMO ROAD", longitude: -97.773568506999951, latitude: 30.221838299000073 },
  { name: "SUMMITT", cls: "ELEM", address: "12207 BRIGADOON LANE", longitude: -97.719133676999945, latitude: 30.418727024000081 },
  { name: "SUNSET VALLEY", cls: "ELEM", address: "3000 JONES ROAD", longitude: -97.806947211999955, latitude: 30.227845459000036 },
  { name: "TRAVIS HEIGHTS", cls: "ELEM", address: "2010 ALAMEDA DRIVE", longitude: -97.745897720999949, latitude: 30.241443206000042 },
  { name: "WALNUT CREEK", cls: "ELEM", address: "401 W. BRAKER LANE", longitude: -97.683828913999946, latitude: 30.379743356000066 },
  { name: "WIDEN", cls: "ELEM", address: "5605 NUCKOLS CROSSING", longitude: -97.739703933999976, latitude: 30.188458700000069 },
  { name: "WILLIAMS", cls: "ELEM", address: "500 MAIRO STREET", longitude: -97.791137237999976, latitude: 30.181024778000051 },
  { name: "WINN", cls: "ELEM", address: "3500 SUSQUEHANNA LANE", longitude: -97.665268662999949, latitude: 30.313875539000037 },
  { name: "WOOLDRIDGE", cls: "ELEM", address: "1412 NORSEMAN TERRACE", longitude: -97.709712635999949, latitude: 30.364958535000028 },
  { name: "ANDREWS", cls: "ELEM", address: "6801 NORTHEAST DRIVE", longitude: -97.679783900999951, latitude: 30.317710412000054 },
  { name: "BARRINGTON", cls: "ELEM", address: "400 COOPER DRIVE", longitude: -97.695922448999966, latitude: 30.360495785000072 },
  { name: "BARTON HILLS", cls: "ELEM", address: "2108 BARTON HILLS DRIVE", longitude: -97.783346566999981, latitude: 30.254405554000073 },
  { name: "BECKER", cls: "ELEM", address: "906 W MILTON STREET", longitude: -97.759313653999982, latitude: 30.250421700000061 },
  { name: "BLACKSHEAR", cls: "ELEM", address: "1712 E. 11TH STREET", longitude: -97.721934647999944, latitude: 30.266990049000071 },
  { name: "BLANTON", cls: "ELEM", address: "5408 WESTMINSTER DRIVE", longitude: -97.690188995999961, latitude: 30.306884763000028 },
  { name: "BOONE", cls: "ELEM", address: "8101 CROFTWOOD DRIVE", longitude: -97.840694937999956, latitude: 30.204007670000067 },
  { name: "BRENTWOOD", cls: "ELEM", address: "6700 ARROYO SECO", longitude: -97.73145124199999, latitude: 30.339799905000064 },
  { name: "SITE 903", cls: "DISTRICT", address: "3100 4TH STREET", longitude: -97.708090090999974, latitude: 30.254773847000024 },
  { name: "BROWN", cls: "ELEM", address: "505 W. ANDERSON LANE", longitude: -97.709086722999984, latitude: 30.344812522000041 },
  { name: "WOOTEN", cls: "ELEM", address: "1406 DALE DRIVE", longitude: -97.719183925999971, latitude: 30.353604611000041 },
  { name: "ZAVALA", cls: "ELEM", address: "310 ROBERT MARTINEZ JR. STREET", longitude: -97.719995519999941, latitude: 30.258037910000045 },
  { name: "ZILKER", cls: "ELEM", address: "1900 BLUEBONNET LANE", longitude: -97.774123946999964, latitude: 30.252749876000056 },
  { name: "OAK HILL", cls: "ELEM", address: "6101 PATTON RANCH ROAD", longitude: -97.858853279999948, latitude: 30.238107798000048 },
  { name: "CLAYTON", cls: "ELEM", address: "7525 LA CROSSE AVE.", longitude: -97.906444410999939, latitude: 30.194849476000059 },
  { name: "BLAZIER 4-6", cls: "ELEM", address: "8801 VERTEX BLVD", longitude: -97.751630587999955, latitude: 30.156212394000082 },
  { name: "OVERTON", cls: "ELEM", address: "7201 COLONY LOOP DRIVE", longitude: -97.636188890999961, latitude: 30.30024080000004 },
  { name: "BALDWIN", cls: "ELEM", address: "12200 MERIDIAN PARK BLVD", longitude: -97.923290706999978, latitude: 30.184839726000064 },
  { name: "PEREZ", cls: "ELEM", address: "7500 S. PLEASANT VALLEY ROAD", longitude: -97.75630334499999, latitude: 30.17048121900007 },
  { name: "PAREDES", cls: "MID", address: "10100 S. MARY MOORE SEARIGHT DRIVE", longitude: -97.811457104999988, latitude: 30.167068751000041 },
  { name: "GRAHAM", cls: "ELEM", address: "11211 TOM ADAMS DRIVE", longitude: -97.66889682599998, latitude: 30.372354104000067 },
  { name: "GULLETT", cls: "ELEM", address: "6310 TREADWELL BLVD.", longitude: -97.748645985999985, latitude: 30.343708587000037 },
  { name: "HARRIS", cls: "ELEM", address: "1711 WHELESS LANE", longitude: -97.691047580999964, latitude: 30.314894818000031 },
  { name: "HIGHLAND PARK", cls: "ELEM", address: "4900 FAIRVIEW DRIVE", longitude: -97.759835086999942, latitude: 30.330352326000025 },
  { name: "HILL", cls: "ELEM", address: "8601 TALLWOOD DRIVE", longitude: -97.74860347399999, latitude: 30.376591160000036 },
  { name: "HOUSTON", cls: "ELEM", address: "5409 PONCIANA DRIVE", longitude: -97.755070806999981, latitude: 30.19775328400004 },
  { name: "JORDAN", cls: "ELEM", address: "6711 JOHNNY MORRIS ROAD", longitude: -97.646919924999963, latitude: 30.300849958000068 },
  { name: "JOSLIN", cls: "ELEM", address: "4500 MENCHACA ROAD", longitude: -97.790210370999944, latitude: 30.227983047000066 },
  { name: "KIKER", cls: "ELEM", address: "5913 LA CROSSE AVE.", longitude: -97.881237466999949, latitude: 30.191540691000057 },
  { name: "KOCUREK", cls: "ELEM", address: "9800 CURLEW DRIVE", longitude: -97.834982491999938, latitude: 30.178047358000072 },
  { name: "ORTEGA", cls: "ELEM", address: "1135 GARLAND AVE.", longitude: -97.684325670999954, latitude: 30.270011177000075 },
  { name: "PALM", cls: "ELEM", address: "7601 DIXIE DRIVE", longitude: -97.743883710999967, latitude: 30.164859374000059 },
  { name: "PATTON", cls: "ELEM", address: "6001 WESTCREEK DRIVE", longitude: -97.845333449999941, latitude: 30.231730563000038 },
  { name: "SITE 906", cls: "DISTRICT", address: "1106 RIO GRANDE", longitude: -97.747944061999988, latitude: 30.275176370000054 },
  { name: "PECAN SPRINGS", cls: "ELEM", address: "3100 ROGGE LANE", longitude: -97.676807691999969, latitude: 30.303025046000077 },
  { name: "PILLOW", cls: "ELEM", address: "3025 CROSSCREEK DRIVE", longitude: -97.733142857999951, latitude: 30.369158919000029 },
  { name: "PLEASANT HILL", cls: "ELEM", address: "6405 CIRCLE S ROAD", longitude: -97.776195280999957, latitude: 30.19638805600005 },
  { name: "REILLY", cls: "ELEM", address: "405 DENSON DRIVE", longitude: -97.719958524, latitude: 30.328237515000069 },
  { name: "RIDGETOP", cls: "ELEM", address: "5005 CASWELL AVE.", longitude: -97.716287936999947, latitude: 30.311984855000048 },
  { name: "SANCHEZ", cls: "ELEM", address: "73 SAN MARCOS STREET", longitude: -97.73518828899995, latitude: 30.258074459000056 },
  { name: "SMALL", cls: "MID", address: "4801 MONTEREY OAKS BLVD.", longitude: -97.84186341899999, latitude: 30.233639738000079 },
  { name: "BAILEY", cls: "MID", address: "4020 LOST OASIS HOLLOW", longitude: -97.872363606999954, latitude: 30.164279990000065 },
  { name: "BEDICHEK", cls: "MID", address: "6800 BILL HUGHES ROAD", longitude: -97.786718223999969, latitude: 30.194418913000053 },
  { name: "BURNET", cls: "MID", address: "8401 HATHAWAY STREET", longitude: -97.725486936999971, latitude: 30.363827933000042 },
  { name: "COVINGTON", cls: "MID", address: "3700 CONVICT HILL ROAD", longitude: -97.83455179799995, latitude: 30.212567401000062 },
  { name: "DOBIE", cls: "MID", address: "1200 E. RUNDBERG LANE", longitude: -97.68036350599999, latitude: 30.354264267000076 },
  { name: "LIVELY", cls: "MID", address: "201 E. MARY STREET", longitude: -97.750274518999959, latitude: 30.243671105000033 },
  { name: "KEALING", cls: "MID", address: "1607 PENNSYLVANIA AVE.", longitude: -97.721861765999961, latitude: 30.27089087600007 },
  { name: "LAMAR", cls: "MID", address: "6201 WYNONA STREET", longitude: -97.740545410999971, latitude: 30.337817990000076 },
  { name: "MARTIN", cls: "MID", address: "1601 HASKELL STREET", longitude: -97.729889621999973, latitude: 30.253040805000069 },
  { name: "MENDEZ", cls: "MID", address: "5106 VILLAGE SQUARE DRIVE", longitude: -97.743480850999958, latitude: 30.189228133000025 },
  { name: "MURCHISON", cls: "MID", address: "3700 N HILLS DRIVE", longitude: -97.758370653999975, latitude: 30.354163238000073 },
  { name: "O HENRY", cls: "MID", address: "2610 W. 10TH STREET", longitude: -97.774150327999962, latitude: 30.285728107000072 },
  { name: "SADLER MEANS", cls: "MID", address: "6401 N. HAMPTON DRIVE", longitude: -97.68048358099999, latitude: 30.31369700700003 },
  { name: "WEBB", cls: "MID", address: "601 E. ST. JOHNS AVE.", longitude: -97.706854045999989, latitude: 30.333496352000054 },
  { name: "GORZYCKI", cls: "MID", address: "7412 W. SLAUGHTER LANE", longitude: -97.891848276999951, latitude: 30.214311899000055 },
  { name: "GARCIA", cls: "MID", address: "7414 JOHNNY MORRIS ROAD", longitude: -97.642754446999959, latitude: 30.311463771000035 },
  { name: "GARZA", cls: "HIGH", address: "1600 CHICON STREET", longitude: -97.72100290899999, latitude: 30.277438907000032 },
  { name: "AKINS", cls: "HIGH", address: "10701 S. FIRST STREET", longitude: -97.800925284999948, latitude: 30.149085824000057 },
  { name: "ANDERSON", cls: "HIGH", address: "8403 MESA DRIVE", longitude: -97.753185162999955, latitude: 30.375655041000073 },
  { name: "BOWIE", cls: "HIGH", address: "4103 W. SLAUGHTER LANE", longitude: -97.858778823999955, latitude: 30.186915879000026 },
  { name: "CROCKETT", cls: "HIGH", address: "5601 MENCHACA ROAD", longitude: -97.796966574999942, latitude: 30.213921697000046 },
  { name: "NAVARRO", cls: "HIGH", address: "1201 PAYTON GIN ROAD", longitude: -97.707960414999945, latitude: 30.360308041000049 },
  { name: "LBJ", cls: "HIGH", address: "7309 LAZY CREEK DRIVE", longitude: -97.656623000999957, latitude: 30.314568555000051 },
  { name: "NORTHEAST/INTERNATIONAL", cls: "HIGH", address: "7104 BERKMAN DRIVE", longitude: -97.691164237999942, latitude: 30.324144249000032 },
  { name: "TRAVIS", cls: "HIGH", address: "1211 E. OLTORF STREET", longitude: -97.74454510599999, latitude: 30.233332373000056 },
  { name: "AUSTIN", cls: "HIGH", address: "1715 W. CESAR CHAVEZ STREET", longitude: -97.767153309999969, latitude: 30.273810837000045 },
  { name: "MCCALLUM", cls: "HIGH", address: "5600 SUNSHINE DRIVE", longitude: -97.730282575999979, latitude: 30.325801637000044 },
  { name: "ROSEDALE", cls: "ALT ED 1", address: "2608 RICH CREEK", longitude: -97.737251844999946, latitude: 30.352738924000054 },
  { name: "EASTSIDE ECHS", cls: "HIGH", address: "900 THOMPSON STREET", longitude: -97.709058418, latitude: 30.269746816000062 },
  { name: "LASA", cls: "HIGH", address: "1012 ARTHUR STILES ROAD", longitude: -97.680374939999979, latitude: 30.258714193000056 },
  { name: "BRYKER WOODS", cls: "ELEM", address: "3309 KERBEY LANE", longitude: -97.750920027999939, latitude: 30.305369168000027 },
  { name: "CAMPBELL", cls: "ELEM", address: "2613 ROGERS AVE.", longitude: -97.713853665999977, latitude: 30.282516119000039 },
  { name: "CASIS", cls: "ELEM", address: "2710 EXPOSITION BLVD.", longitude: -97.765508574999956, latitude: 30.304354434000064 },
  { name: "COOK", cls: "ELEM", address: "1511 CRIPPLE CREEK DRIVE", longitude: -97.704665301999967, latitude: 30.377854415000058 },
  { name: "CUNNINGHAM", cls: "ELEM", address: "2200 BERKELEY AVE.", longitude: -97.805974824999964, latitude: 30.210284973000061 },
  { name: "DAVIS", cls: "ELEM", address: "5214 DUVAL ROAD", longitude: -97.741342427999939, latitude: 30.418619240000059 },
  { name: "DAWSON", cls: "ELEM", address: "3001 S. 1ST STREET", longitude: -97.763599237999983, latitude: 30.234097144000032 },
  { name: "DOSS", cls: "ELEM", address: "7005 NORTHLEDGE DRIVE", longitude: -97.762333079999962, latitude: 30.356454013000079 },
  { name: "GALINDO", cls: "ELEM", address: "3800 S. 2ND STREET", longitude: -97.77181160899994, latitude: 30.229524409000081 },
  { name: "GOVALLE", cls: "ELEM", address: "3601 GOVALLE AVE.", longitude: -97.698586490999958, latitude: 30.264157230000023 },
  { name: "BARANOFF", cls: "ELEM", address: "12009 BUCKINGHAM GATE ROAD", longitude: -97.852032297999983, latitude: 30.15382154100007 },
  { name: "CASEY", cls: "ELEM", address: "9400 TEXAS OAKS DRIVE", longitude: -97.814849948999949, latitude: 30.176860730000048 },
  { name: "COWAN", cls: "ELEM", address: "2817 KENTISH DRIVE", longitude: -97.833434687999954, latitude: 30.188683986000054 },
  { name: "HART", cls: "ELEM", address: "8301 FURNESS STREET", longitude: -97.688635610999938, latitude: 30.342462309000037 },
  { name: "MCBEE", cls: "ELEM", address: "1001 WEST BRAKER", longitude: -97.691094586999952, latitude: 30.383218188000058 },
  { name: "MILLS", cls: "ELEM", address: "6201 DAVIS LANE", longitude: -97.877695084, latitude: 30.210647689000041 },
  { name: "PICKLE", cls: "ELEM", address: "1101 WHEATLEY AVE.", longitude: -97.693826787999967, latitude: 30.333081363000073 },
  { name: "RODRIGUEZ", cls: "ELEM", address: "4400 FRANKLIN PARK DRIVE", longitude: -97.747339828999941, latitude: 30.200691326000026 },
  { name: "ALC", cls: "ALT ED 1", address: "4900 GONZALES STREET", longitude: -97.697133354999949, latitude: 30.256067088000066 },
  { name: "ALLISON", cls: "ELEM", address: "515 VARGAS ROAD", longitude: -97.691597196999965, latitude: 30.236035031000032 },
  { name: "UPHAUS", cls: "ELEM", address: "5200 FREIDRICH LANE", longitude: -97.755755145999956, latitude: 30.201677209000025 },
  { name: "TRAVIS GPA", cls: "ALT ED 1", address: "1211 E. OLTORF STREET", longitude: -97.744553958999973, latitude: 30.234853022000035 },
  { name: "NAVARRO GPA", cls: "ALT ED 1", address: "1201 PAYTON GIN ROAD", longitude: -97.708809671999973, latitude: 30.361380152000038 },
  { name: "DAEP", cls: "ALT ED 1", address: "906 W MILTON STREET", longitude: -97.760066369999947, latitude: 30.250788101000072 },
  { name: "GUERRERO THOMPSON", cls: "ELEM", address: "102 E. RUNDBERG LANE", longitude: -97.693216322999945, latitude: 30.360927834000051 },
  { name: "PADRON", cls: "ELEM", address: "2011 W. RUNDBERG LANE", longitude: -97.719939874999966, latitude: 30.373261972000023 },
  { name: "SITE 908", cls: "DISTRICT", address: "2117 W 49TH STREET", longitude: -97.740238778999981, latitude: 30.319664985000028 },
  { name: "RICHARDS SYWL", cls: "HIGH", address: "2206 PRATHER LANE", longitude: -97.788866410999958, latitude: 30.236865354000035 },
  { name: "BEAR CREEK", cls: "ELEM", address: "12801 ESCARPMENT BLVD", longitude: -97.910329661999981, latitude: 30.170175377000074 },
  { name: "MARSHALL", cls: "MID", address: "", longitude: -97.694404389999988, latitude: 30.297154123000045 },
  { name: "BLAZIER K-3", cls: "ELEM", address: "8601 VERTEX BLVD", longitude: -97.751776970219979, latitude: 30.156615862131666 },
  { name: "AISD CENTRAL", cls: "DISTRICT", address: "4000 S IH 35 FRONTAGE ROAD", longitude: -97.753493217576803, latitude: 30.218597900539859 },
  { name: "CLIFTON", cls: "ALT ED 1", address: "1519 CORONADO HILLS DRIVE", longitude: -97.687337593961246, latitude: 30.326336091703794 },
  { name: "BURGER ATHLETIC", cls: "ATHLETIC", address: "3200 JONES ROAD", longitude: -97.809684187128056, latitude: 30.230505831757888 },
  { name: "DELCO CENTER", cls: "ATHLETIC", address: "4601 PECAN BROOK DRIVE", longitude: -97.660440060844522, latitude: 30.317560125673836 },
  { name: "HOUSE PARK", cls: "ATHLETIC", address: "1301 SHOAL CREEK BLVD", longitude: -97.748945809522269, latitude: 30.278223319396258 },
  { name: "NELSON BUS", cls: "DISTRICT", address: "7105 BERKMAN DRIVE", longitude: -97.686149343501285, latitude: 30.323753112377059 },
  { name: "NELSON FIELD", cls: "ATHLETIC", address: "7105 BERKMAN DRIVE", longitude: -97.688176644278258, latitude: 30.323458059212328 },
  { name: "NOACK SPORTS", cls: "ATHLETIC", address: "5300 CRAINWAY DRIVE", longitude: -97.656226041411841, latitude: 30.317737872421535 },
  { name: "PAC", cls: "DISTRICT", address: "1500 BARBARA JORDAN BLVD", longitude: -97.703019502277897, latitude: 30.304259396355349 },
  { name: "SAEGERT BUS", cls: "DISTRICT", address: "3300 JONES ROAD", longitude: -97.812516732387763, latitude: 30.231387137889001 },
  { name: "SERVICE CENTER", cls: "DISTRICT", address: "5101 E 51ST STREET", longitude: -97.673237294988624, latitude: 30.292809255125281 },
  { name: "SOUTHEAST BUS", cls: "DISTRICT", address: "7200 BLUFF SPRINGS ROAD", longitude: -97.770212462414591, latitude: 30.180903437357635 },
  { name: "CENTRAL WAREHOUSE", cls: "DISTRICT", address: "3701 WOODBURY DRIVE", longitude: -97.75950305978742, latitude: 30.225223900909182 },
];

export const SCHOOL_LOCATIONS: SchoolLocation[] = RAW_FEATURES.map((f) => ({
  buildingName: f.name,
  schoolLevel: classToLevel(f.cls),
  planSuffix: classToPlanSuffix(f.cls),
  address: f.address,
  latitude: f.latitude,
  longitude: f.longitude,
  coordinates: [f.longitude, f.latitude] as [number, number],
})).sort((a, b) => a.buildingName.localeCompare(b.buildingName));

/** Alphabetically sorted list of building names for the dropdown. */
export const SCHOOL_NAMES: string[] = SCHOOL_LOCATIONS.map((s) => s.buildingName);

/** Look up a school's location record by its building name. */
export function getSchoolByName(name: string): SchoolLocation | undefined {
  return SCHOOL_LOCATIONS.find((s) => s.buildingName === name);
}
