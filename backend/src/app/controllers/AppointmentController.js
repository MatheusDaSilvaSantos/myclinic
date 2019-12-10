import * as Yup from 'yup';
import { startOfHour, parseISO, isBefore, format } from 'date-fns';
import pt from 'date-fns/locale/pt';
import Appointment from '../models/Appointment';
import User from '../models/User';
import File from '../models/File';
import Notification from '../schemas/Notification';

class AppointmentController {
  async index(req, res) {
    const { page = 1 } = req.query;
    const appointment = await Appointment.findAll({
      where: { user_id: req.userId, canceled_at: null },
      order: ['date'],
      attributes: ['id', 'date'],
      limit: 20,
      offset: (page - 1) * 20,
      include: [
        {
          model: User,
          as: 'doctor',
          attributes: ['id', 'name', 'email', 'profession'],
          include: [
            {
              model: File,
              as: 'avatar',
              attributes: ['id', 'path', 'url'],
            },
          ],
        },
      ],
    });
    return res.json(appointment);
  }

  async store(req, res) {
    const schema = Yup.object().shape({
      doctor_id: Yup.number().required(),
      date: Yup.date().required(),
    });
    if (!(await schema.isValid(req.body))) {
      return res
        .status(400)
        .json({ error: 'Erro na validação, confira todos os campos' });
    }

    const { doctor_id, date } = req.body;

    /** Checking the doctor exists */

    const checkIsDoctor = await User.findOne({
      where: { id: doctor_id, doctor: true },
    });

    if (!checkIsDoctor) {
      return res.status(401).json({
        error:
          'Agendamentos de consultas são somente com dentistas autorizados!',
      });
    }

    /** Checking if the user is a doctor */

    const user = await User.findByPk(req.userId);
    if (user.doctor) {
      return res.status(401).json({
        error: 'Dentistas não podem criar agendamentos',
      });
    }

    /** Checking past dates */
    const hourStart = startOfHour(parseISO(date));
    if (isBefore(hourStart, new Date())) {
      return res
        .status(400)
        .json({ error: ' Datas passadas não são permitidas' });
    }

    /** Checking if the date is avaiable */
    const checkAvailability = await Appointment.findOne({
      where: {
        doctor_id,
        canceled_at: null,
        date: hourStart,
      },
    });
    if (checkAvailability) {
      return res.status(400).json({
        error: 'A data selecionada não está disponivel para agendamentos',
      });
    }

    const appointment = await Appointment.create({
      user_id: req.userId,
      doctor_id,
      date: hourStart,
    });

    /** Notify the doctor */
    const formattedDate = format(hourStart, "dd 'de' MMMM', às ' H:mm'h'", {
      locale: pt,
    });
    await Notification.create({
      content: `Novo consulta agendada por ${user.name} para o dia ${formattedDate}`,
      user: doctor_id,
    });

    return res.json(appointment);
  }
}

export default new AppointmentController();
