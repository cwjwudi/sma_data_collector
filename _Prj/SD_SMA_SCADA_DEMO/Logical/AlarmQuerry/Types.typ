(*DBQuery*)

TYPE
	dbReadConfig_typ : 	STRUCT 
		strStartTime : ARRAY[0..DB_READ_QUERY_SIZE_MINUS_ONE]OF STRING[20];
		strEndTime : ARRAY[0..DB_READ_QUERY_SIZE_MINUS_ONE]OF STRING[20];
		strPointName : ARRAY[0..DB_READ_QUERY_SIZE_MINUS_ONE]OF STRING[20];
	END_STRUCT;
	dbReadRev_typ : 	STRUCT 
		rRevBuffer : ARRAY[0..REV_BUFFER_SIZE_MINUS_ONE]OF REAL;
	END_STRUCT;
	dbReadQuery_typ : 	STRUCT 
		stConfig : dbReadConfig_typ;
		stRev : ARRAY[0..DB_READ_QUERY_SIZE_MINUS_ONE]OF dbReadRev_typ;
	END_STRUCT;
END_TYPE
