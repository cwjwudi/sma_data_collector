
PROGRAM _INIT
	ProductDataSQLQuery.Config.PointName[0] := 'DataProductTime';
	ProductDataSQLQuery.Config.PointName[1] := 'DataProductState';
	ProductDataSQLQuery.Config.PointName[2] := 'DataProductCH01';
	ProductDataSQLQuery.Config.PointName[3] := 'DataProductCH02';
	ProductDataSQLQuery.Config.PointName[4] := 'DataProductCH03';
	ProductDataSQLQuery.Config.PointName[5] := 'DataProductCH04';
	ProductDataSQLQuery.Config.PointName[6] := 'DataProductCH05';
	ProductDataSQLQuery.Config.PointName[7] := 'DataProductCH06';
	bSimEnable := TRUE;
END_PROGRAM

PROGRAM _CYCLIC
	(*Fill gDataSQLProduct (DataSQLProduct_typ), then set ProductInsert*)
	UtcDTGetTime_0.enable := TRUE;
	UtcDTGetTime_0();
	IF UtcDTGetTime_0.status = 0 THEN
		dtNow := UtcDTGetTime_0.DT1;
	END_IF

	tonProduct(IN := bSimEnable AND NOT gDataSQLOperate.ProductInsert, PT := T#2s);
	IF EDGEPOS(tonProduct.Q) THEN
		gDataSQLProduct.TimeStamp := dtNow;
		gDataSQLProduct.State := 2;
		gDataSQLProduct.CH01 := RandRangeReal(5, 15);
		gDataSQLProduct.CH02 := RandRangeReal(2, 6);
		gDataSQLProduct.CH03 := RandRangeReal(0.8, 1.2);
		gDataSQLProduct.CH04 := RandRangeReal(5, 15);
		gDataSQLProduct.CH05 := RandRangeReal(2, 6);
		gDataSQLProduct.CH06 := RandRangeReal(0.8, 1.2);
		gDataSQLOperate.ProductInsert := TRUE;
	END_IF
END_PROGRAM

PROGRAM _EXIT

END_PROGRAM
