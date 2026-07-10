
PROGRAM _INIT
	RecipeDataSQLQuery.Config.PointName[0] := 'DataRecipeTime';
	RecipeDataSQLQuery.Config.PointName[1] := 'DataRecipeState';
	RecipeDataSQLQuery.Config.PointName[2] := 'DataRecipeCH00';
	RecipeDataSQLQuery.Config.PointName[3] := 'DataRecipeCH01';
	RecipeDataSQLQuery.Config.PointName[4] := 'DataRecipeCH02';
	RecipeDataSQLQuery.Config.PointName[5] := 'DataRecipeCH03';
	RecipeDataSQLQuery.Config.PointName[6] := 'DataRecipeCH04';
	RecipeDataSQLQuery.Config.PointName[7] := 'DataRecipeCH05';
	RecipeDataSQLQuery.Config.PointName[8] := 'DataRecipeCH06';
	RecipeDataSQLQuery.Config.PointName[9] := 'DataRecipeCH07';
	RecipeDataSQLQuery.Config.PointName[10] := 'DataRecipeCH08';
	RecipeDataSQLQuery.Config.PointName[11] := 'DataRecipeCH09';
	RecipeDataSQLQuery.Config.PointName[12] := 'DataRecipeCH10';
	RecipeDataSQLQuery.Config.PointName[13] := 'DataRecipeCH11';
	RecipeDataSQLQuery.Config.PointName[14] := 'DataRecipeCH12';
	RecipeDataSQLQuery.Config.PointName[15] := 'DataRecipeCH13';
	RecipeDataSQLQuery.Config.PointName[16] := 'DataRecipeCH14';
	RecipeDataSQLQuery.Config.PointName[17] := 'DataRecipeCH15';
	RecipeDataSQLQuery.Config.PointName[18] := 'DataRecipeCH16';
	RecipeDataSQLQuery.Config.PointName[19] := 'DataRecipeCH17';
	RecipeDataSQLQuery.Config.PointName[20] := 'DataRecipeCH18';
	RecipeDataSQLQuery.Config.PointName[21] := 'DataRecipeCH19';
	RecipeDataSQLQuery.Config.PointName[22] := 'DataRecipeCH20';
	RecipeDataSQLQuery.Config.PointName[23] := 'DataRecipeCH21';
	RecipeDataSQLQuery.Config.PointName[24] := 'DataRecipeCH22';
	RecipeDataSQLQuery.Config.PointName[25] := 'DataRecipeCH23';
	RecipeDataSQLQuery.Config.PointName[26] := 'DataRecipeCH24';
	RecipeDataSQLQuery.Config.PointName[27] := 'DataRecipeCH25';
	bSimEnable := TRUE;
END_PROGRAM

PROGRAM _CYCLIC
	(*Fill gDataSQLRecipe (DataSQLRecipe_typ), then set RecipeInsert*)
	UtcDTGetTime_0.enable := TRUE;
	UtcDTGetTime_0();
	IF UtcDTGetTime_0.status = 0 THEN
		dtNow := UtcDTGetTime_0.DT1;
	END_IF

	tonRecipe(IN := bSimEnable AND NOT gDataSQLOperate.RecipeInsert, PT := T#5s);
	IF EDGEPOS(tonRecipe.Q) THEN
		gDataSQLRecipe.TimeStamp := dtNow;
		gDataSQLRecipe.State := 1;
		gDataSQLRecipe.CH00 := RandRangeReal(20, 80);
		gDataSQLRecipe.CH01 := RandRangeReal(2, 6);
		gDataSQLRecipe.CH02 := RandRangeReal(10, 40);
		gDataSQLRecipe.CH03 := RandRangeReal(0.1, 2);
		gDataSQLRecipe.CH04 := RandRangeReal(0.1, 2);
		gDataSQLRecipe.CH05 := RandRangeReal(2, 6);
		gDataSQLRecipe.CH06 := RandRangeReal(5, 20);
		gDataSQLRecipe.CH07 := RandRangeReal(0.1, 2);
		gDataSQLRecipe.CH08 := RandRangeReal(0.1, 2);
		gDataSQLRecipe.CH09 := RandRangeReal(2, 6);
		gDataSQLRecipe.CH10 := RandRangeReal(10, 40);
		gDataSQLRecipe.CH11 := RandRangeReal(0.1, 2);
		gDataSQLRecipe.CH12 := RandRangeReal(0.1, 2);
		gDataSQLRecipe.CH13 := RandRangeReal(2, 6);
		gDataSQLRecipe.CH14 := RandRangeReal(5, 20);
		gDataSQLRecipe.CH15 := RandRangeReal(0.1, 2);
		gDataSQLRecipe.CH16 := RandRangeReal(0.1, 2);
		gDataSQLRecipe.CH17 := RandRangeReal(5, 15);
		gDataSQLRecipe.CH18 := RandRangeReal(5, 15);
		gDataSQLRecipe.CH19 := RandRangeReal(10, 50);
		gDataSQLRecipe.CH20 := RandRangeReal(10, 50);
		gDataSQLRecipe.CH21 := RandRangeReal(50, 150);
		gDataSQLRecipe.CH22 := RandRangeReal(50, 150);
		gDataSQLRecipe.CH23 := 0;
		gDataSQLRecipe.CH24 := 0;
		gDataSQLRecipe.CH25 := 0;
		gDataSQLOperate.RecipeInsert := TRUE;
	END_IF
END_PROGRAM

PROGRAM _EXIT

END_PROGRAM
