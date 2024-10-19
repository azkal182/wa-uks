import { db } from "./db"
import _ from "lodash";

export const getListPostren = async () => {
    const result = await db.master.findMany({
        where: {
            returnTo: null
        },
        include: {
            Student: true,
            Keluhan: true,
            Kelas: true
        }
    })
    const groupedByAsrama = _.groupBy(result, 'asramaId');

    return groupedByAsrama
}
